# OpenCode 文件编辑实现

> OpenCode 的 Edit、Write、Apply Patch 工具完整分析

## 工具概览

| 工具 | 文件 | 用途 |
|------|------|------|
| **Edit** | `packages/opencode/src/tool/edit.ts` | 精确字符串替换，8 级容错匹配 |
| **Write** | `packages/opencode/src/tool/write.ts` | 全文覆写或创建新文件 |
| **Apply Patch** | `packages/opencode/src/tool/apply_patch.ts` | 结构化 patch 应用（多文件操作） |

## Edit 工具

### 输入参数

```typescript
{
  filePath: string        // 绝对路径
  oldString: string       // 要查找的文本
  newString: string       // 替换文本
  replaceAll?: boolean    // 默认 false
}
```

### 核心算法 — 八级级联匹配

`replace()` 函数（`edit.ts:674`）的核心逻辑：

```typescript
for (const replacer of [SimpleReplacer, LineTrimmedReplacer, ...]) {
  for (const search of replacer(content, oldString)) {
    const index = content.indexOf(search)
    if (index === -1) continue
    notFound = false
    if (replaceAll) return content.replaceAll(search, newString)
    // 唯一性检查
    if (content.lastIndexOf(search) !== index) continue
    return content.substring(0, index) + newString + content.substring(index + search.length)
  }
}
```

依次尝试 8 种匹配策略，匹配成功后用 `substring` 拼接执行替换。

### 八级匹配策略详解

#### 1. SimpleReplacer（`edit.ts:240`）
直接精确字符串匹配，不做任何预处理。

#### 2. LineTrimmedReplacer（`edit.ts:244`）
逐行 trim 首尾空格后匹配。适合缩进不一致的情况。

#### 3. BlockAnchorReplacer（`edit.ts:284`）
使用首行和末行作为锚点，中间用 **Levenshtein 距离**做模糊匹配：
- 单候选时阈值 0.0（精确匹配）
- 多候选时阈值 0.3（允许 30% 差异）

Levenshtein 距离实现（`edit.ts:222`）：

```typescript
function levenshtein(a: string, b: string): number {
  // 标准动态规划实现
  // dp[i][j] = a[0..i] 变换到 b[0..j] 的最小编辑距离
}
```

#### 4. WhitespaceNormalizedReplacer（`edit.ts:419`）
所有连续空白字符归一化为单个空格后匹配。

#### 5. IndentationFlexibleReplacer（`edit.ts:463`）
移除公共缩进后匹配。适合不同缩进层级的代码。

#### 6. EscapeNormalizedReplacer（`edit.ts:491`）
处理转义字符差异，如 `\n`、`\t` 等。

#### 7. TrimmedBoundaryReplacer（`edit.ts:554`）
整体 trim 首尾空白后匹配。

#### 8. ContextAwareReplacer（`edit.ts:580`）
使用首尾行作为锚点，要求中间行有 50% 相似度。

### 并发保护

使用 per-file 信号量锁（`edit.ts:35-45`），防止同时编辑同一文件导致竞态条件。

### 行尾归一化

`edit.ts:22-33` 在匹配前将 `\r\n` 统一为 `\n`。

### 错误处理

- `oldString === newString` → 报错（无意义的替换）
- 匹配不到 → 报错（`notFound` 标志）
- 多处匹配且 `replaceAll=false` → 报错

---

## Write 工具

### 输入参数

```typescript
{
  filePath: string   // 绝对路径
  content: string    // 完整文件内容
}
```

### 核心流程（`write.ts:46-67`）

```typescript
const exists = yield* fs.existsSafe(filepath)
const source = exists ? yield* Bom.readFile(fs, filepath) : { bom: false, text: "" }
const next = Bom.split(params.content)
const desiredBom = source.bom || next.bom
yield* afs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom))
```

1. 检查文件是否存在
2. 如果存在，读取原文件的 BOM 信息
3. 合并 BOM：保留原文件的 BOM，或使用新内容中的 BOM
4. 通过 `writeWithDirs` 写入（自动创建目录）
5. 写后自动格式化（如果配置了 formatter）

### BOM 处理

`Bom`（`packages/opencode/src/util/bom.ts`）处理字节序标记：
- `Bom.readFile()` — 读文件并检测 BOM
- `Bom.split()` — 从内容中分离 BOM
- `Bom.join()` — 将 BOM 加回内容

---

## Apply Patch 工具

### Patch 格式（与 Codex 类似）

```
*** Begin Patch
*** Add File: <path>
+content lines
*** Update File: <path>
*** Move to: <new_path>
@@ context line
-removed lines
+added lines
*** Delete File: <path>
*** End Patch
```

### 核心流程（`apply_patch.ts:30-299`）

1. 解析 patch 文本为结构化的 hunk 列表
2. 验证文件路径和权限
3. 对每个 hunk：
   - **Add**：写入新文件
   - **Delete**：删除文件
   - **Update**：通过 `deriveNewContentsFromChunks()` 计算新内容
   - **Move**：写到新路径后删除原文件
4. 应用变更到文件系统
5. 发布事件并返回诊断信息

### Patch 应用算法（`packages/opencode/src/patch/index.ts`）

#### 序列匹配 — `seekSequence()`（`patch/index.ts:467`）

四级渐进匹配：

```
Pass 1: 精确匹配
Pass 2: trim trailing whitespace
Pass 3: trim 两端空白
Pass 4: Unicode 标点标准化
```

这与 Codex 的 `seek_sequence()` 策略几乎相同。

#### 替换计算 — `computeReplacements()`（`patch/index.ts:312`）

```typescript
function computeReplacements(originalLines, filePath, chunks) {
  for (const chunk of chunks) {
    if (chunk.change_context) {
      const contextIdx = seekSequence(originalLines, [chunk.change_context], lineIndex)
      lineIndex = contextIdx + 1
    }
    let found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file)
    replacements.push([found, pattern.length, newSlice])
  }
  return replacements.sort((a, b) => a[0] - b[0])
}
```

#### 应用替换（`patch/index.ts:349`）

计算出替换元组后，按位置应用。类似 Codex 的方式。

### 边界情况

- EOF 锚定支持
- Unicode 标点标准化（`patch/index.ts:424`）
- 尾部换行处理
- BOM 保留
- 文件移动/重命名支持

---

## 文件 I/O

### 读取

通过 Effect 框架封装：

```
edit.ts → Bom.readFile(afs, filePath)
       → AppFileSystem.readFile(filePath)  // packages/core/src/filesystem.ts
       → Effect NodeFileSystem              // Effect 框架
       → Node fs/promises.readFile()        // Node.js 底层
```

完整读入 Buffer，用 `TextDecoder("utf-8", { ignoreBOM: true })` 解码为字符串。

### 写入

```
edit.ts → afs.writeWithDirs(filePath, content)
       → fs.writeFileString(path, content)  // Effect FileSystem
       → Node fs/promises.writeFile()        // Node.js 底层
```

`writeWithDirs`（`packages/core/src/filesystem.ts:97`）：
- 先尝试写入
- 如果失败（目录不存在），递归创建目录后重试
- 写后运行 formatter
- 同步 BOM

直接覆盖，无原子写入。

---

## 与 Claude Code / Codex 的关键差异

| 特性 | Claude Code | Codex | OpenCode |
|------|:-----------:|:-----:|:--------:|
| Edit 匹配策略数 | 1 | 4 | **8** |
| Levenshtein 模糊匹配 | ❌ | ❌ | ✅ |
| 并发文件锁 | ❌ | ❌ | ✅ |
| 写后自动格式化 | ❌ | ❌ | ✅ |
| BOM 处理 | 编码检测 | ❌ | ✅ (保留) |
| 原子写入 | ✅ | ❌ | ❌ |
| Patch 工具 | ❌ | ✅ | ✅ |
| 流式 patch 解析 | ❌ | ✅ | ❌ |
| 沙箱安全 | ❌ | ✅ | ❌ |

---

## 关键源码路径

```
opencode/packages/
├── opencode/src/
│   ├── tool/
│   │   ├── edit.ts           # Edit 工具 + 8 级匹配策略 + Levenshtein
│   │   ├── write.ts          # Write 工具 + BOM 处理
│   │   └── apply_patch.ts    # Patch 工具入口
│   ├── patch/
│   │   └── index.ts          # Patch 应用引擎 (seekSequence, computeReplacements)
│   └── util/
│       └── bom.ts            # BOM 检测和处理
└── core/src/
    └── filesystem.ts         # AppFileSystem (writeWithDirs, 自动创建目录)
```
