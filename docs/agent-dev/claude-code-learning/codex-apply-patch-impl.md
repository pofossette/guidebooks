# Codex apply_patch 实现

> Codex 自定义 patch 系统的完整实现分析

## 架构概览

Codex 的文件编辑围绕一个核心工具 `apply_patch` 构建，使用自定义 patch 格式（不是 unified diff），通过多阶段管道解析和应用。

### 分层架构

```
┌─────────────────────────────────────────────┐
│  Tool Handler (handlers/apply_patch.rs)      │  工具调度、权限、安全
├─────────────────────────────────────────────┤
│  Safety Assessment (safety.rs)               │  沙箱路径检查
├─────────────────────────────────────────────┤
│  Patch Engine (apply-patch/src/lib.rs)       │  核心编辑逻辑
│  ├── Parser (parser.rs)                      │  解析 patch 文本
│  ├── Seek Sequence (seek_sequence.rs)        │  模糊行匹配
│  └── Streaming Parser (streaming_parser.rs)  │  流式解析
├─────────────────────────────────────────────┤
│  Filesystem Abstraction (file-system/)       │  文件读写抽象
│  └── Local FS (exec-server/)                 │  本地 + 沙箱实现
└─────────────────────────────────────────────┘
```

## Patch 格式

自定义的文件级 diff 格式（`parser.rs:1-21`）：

```
*** Begin Patch
*** Add File: path/to/new.ts
+export function hello() {
+  return "world";
+}
*** Delete File: path/to/old.ts
*** Update File: path/to/existing.ts
*** Move to: path/to/renamed.ts
@@ functionName
  unchanged context line
- old line to remove
+ new line to add
*** End Patch
```

三种操作：
- **Add File** — 创建新文件，`+` 开头的行是内容
- **Delete File** — 删除文件
- **Update File** — 修改文件，可选 `Move to` 重命名。由一个或多个 chunk 组成，`@@` 分隔

每个 chunk 中：
- 行首空格 = 上下文行（不变）
- 行首 `-` = 删除行
- 行首 `+` = 新增行
- `@@ context` = 上下文标记，用于定位

## 解析器

### `parse_patch()`（`parser.rs:126`）

两种模式：
- **严格模式**：要求精确的 `*** Begin Patch` / `*** End Patch` 分隔符
- **宽松模式**（当前默认）：额外处理 heredoc 包裹的 patch（`<<EOF ... EOF`），兼容 GPT-4.1 的输出习惯

每个 UpdateFile chunk 解析为 `UpdateFileChunk`：
```rust
struct UpdateFileChunk {
    change_context: Option<String>,  // 上下文锚定（类名/方法名）
    old_lines: Vec<String>,          // 要找的旧行
    new_lines: Vec<String>,          // 替换后的新行
    is_end_of_file: bool,            // 是否锚定到文件末尾
}
```

### `StreamingPatchParser`（`streaming_parser.rs:19`）

逐字符增量解析器，通过 `push_delta()` 接受任意大小的输入块。用于模型还在流式输出 patch 时就实时解析，每 500ms 更新一次进度。

### 调用检测（`invocation.rs:134`）

`maybe_parse_apply_patch_verified()` 识别多种调用形式：

1. 直接调用：`["apply_patch", "<patch_text>"]`
2. Shell heredoc：`["bash", "-lc", "apply_patch <<'EOF'\n...\nEOF"]`
3. 带 cd：`["bash", "-lc", "cd path && apply_patch <<'EOF'\n...\nEOF"]`
4. PowerShell/Cmd：类似的 heredoc 形式

Heredoc 提取使用 **Tree-sitter** 的 Bash 语法解析 shell 脚本 AST，精确提取 heredoc body。

## 核心编辑算法

### 四级模糊匹配 — `seek_sequence()`（`seek_sequence.rs:12`）

用于在文件内容中定位 chunk 的目标位置：

```
Pass 1: 精确匹配 — 逐字节比较 pattern 和文件对应行
Pass 2: trim trailing — 两边都 trim_end() 后比较
Pass 3: full trim — 两边都 trim() 后比较
Pass 4: Unicode 归一化 — 弯引号→直引号、长破折号→减号、不间断空格→空格
```

特殊机制：
- `eof=true` 时从文件末尾开始搜索
- 空 pattern 始终匹配
- pattern 行数 > 文件行数时立即返回 None

### 替换计算 — `compute_replacements()`（`lib.rs:692`）

对每个 chunk：
1. 如果有 `change_context` → 先用 `seek_sequence()` 定位上下文行，然后跳过
2. 如果 `old_lines` 为空（纯插入）→ 在文件末尾插入
3. 否则用 `seek_sequence()` 找到 `old_lines` 序列的位置
4. 生成 `(start_index, old_len, new_lines)` 元组

所有替换按 `start_index` 升序排列。

### 替换应用 — `apply_replacements()`（`lib.rs:784`）

**关键设计：从后往前应用**

```rust
for (start_idx, old_len, new_lines) in replacements.iter().rev() {
    lines.splice(start_idx..start_idx + old_len, new_lines.clone());
}
```

从后往前可以避免前面的增删导致后面的索引偏移。最后确保文件有尾部换行。

### 文件写入 — `apply_hunks_to_files()`（`lib.rs:362`）

- **AddFile**：写入新内容，目录不存在时递归创建
- **DeleteFile**：读取内容（用于 delta 跟踪），验证不是目录，然后删除
- **UpdateFile**：计算新内容后写入；如果指定了 `move_path`，写到新路径后删除原文件

## 边界情况处理

**尾部换行**：按 `\n` split 后丢弃末尾空元素，替换完成后重新添加尾部换行。

**EOF 空行重试**：当 `old_lines` 末尾是空字符串（表示文件末尾换行哨兵），且搜索失败时，去掉末尾空元素重试。

**缺失父目录**：`write_file_with_missing_parent_retry()`（`lib.rs:614`）捕获 `NotFound`，递归创建目录后重试。

**部分失败跟踪**：`AppliedPatchDelta` 结构跟踪哪些变更已提交。`exact` 标志在写操作可能部分修改文件时设为 false。

## 安全与沙箱

### `assess_patch_safety()`（`safety.rs`）

检查所有受影响路径是否在可写根目录内（由沙箱策略定义）。路径在项目外的 patch 可以被自动拒绝或发送给用户审批。

### 权限合并

工具处理器合并会话级/轮次级的已授予权限与沙箱策略，计算有效权限。

## I/O 层

### 读取

`ExecutorFileSystem::read_file_text()`（`file-system/src/lib.rs:143`）：

1. `tokio::fs::metadata(path)` — 检查大小不超过 512 MiB
2. `tokio::fs::read(path)` — 读取为 `Vec<u8>`
3. `String::from_utf8(bytes)` — 解码为字符串

### 写入

`DirectFileSystem::write_file()`（`local_file_system.rs:257`）：

```rust
tokio::fs::write(path.as_path(), contents).await
```

直接覆盖，无原子写入。

通过 `ExecutorFileSystem` trait 抽象，支持不同的文件系统实现（本地、沙箱等）。

## 关键源码路径

```
codex-rs/apply-patch/src/
├── lib.rs                # apply_patch() 入口, compute/apply replacements
├── parser.rs             # patch 格式解析器
├── seek_sequence.rs      # 四级模糊匹配
├── streaming_parser.rs   # 流式解析器
├── invocation.rs         # 调用检测 + Tree-sitter heredoc 提取
└── standalone_executable.rs  # 独立二进制入口

codex-rs/core/src/
├── tools/handlers/apply_patch.rs  # ToolHandler 实现
├── apply_patch.rs                 # 安全评估
└── safety.rs                      # 沙箱路径检查

codex-rs/file-system/src/lib.rs          # ExecutorFileSystem trait
codex-rs/exec-server/src/local_file_system.rs  # 本地文件系统实现
```
