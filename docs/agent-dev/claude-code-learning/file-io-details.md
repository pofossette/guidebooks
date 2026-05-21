# 文件 I/O 实现细节

> 三个项目的底层文件读写机制分析

## 核心结论

三个项目**都不使用外部命令**（cat、sed、patch 等），全部通过各自语言的标准库 API 直接操作文件系统。

## 读文件

### Claude Code

**调用链**：`FileEditTool.call()` → `readFileForEdit()` → `readFileSyncWithMetadata()`

`readFileSyncWithMetadata`（`src/utils/fileRead.ts:75`）的流程：

1. 调用 `safeResolvePath()` 解析符号链接（`fs.realpathSync()`）
2. 调用 `detectEncodingForResolvedPath()` 检测编码：用 `fs.openSync` + `fs.readSync(path, { length: 4096 })` 读前 4096 字节，检查 BOM 判断 UTF-16LE 还是 UTF-8
3. 调用 `fs.readFileSync(resolvedPath, { encoding })` 把整个文件读成一个 JavaScript 字符串
4. 将 `\r\n` 统一替换为 `\n`

验证阶段还有一条异步路径：`fs.readFileBytes(fullFilePath)` 使用 `fs.promises.readFile` 读取为 Buffer，用于检查文件是否被外部修改过。

### Codex

**调用链**：`apply_patch()` → `derive_new_contents_from_chunks()` → `fs.read_file_text()` → `fs.read_file()`

`DirectFileSystem::read_file`（`codex-rs/exec-server/src/local_file_system.rs:242`）的流程：

1. `tokio::fs::metadata(path)` — 异步 stat，检查文件大小不超过 512 MiB（`MAX_READ_FILE_BYTES`）
2. `tokio::fs::read(path)` — 异步读取整个文件到 `Vec<u8>`
3. `String::from_utf8(bytes)` — 将字节解码为 Rust String

通过 `ExecutorFileSystem` trait 抽象（`codex-rs/file-system/src/lib.rs:134`），支持不同的文件系统实现（本地/沙箱）。

### OpenCode

**调用链**：`edit.ts execute()` → `Bom.readFile(afs, filePath)` → `fs.readFile(filePath)`

`Bom.readFile`（`packages/opencode/src/util/bom.ts:18`）的流程：

1. 调用 Effect 框架的 `FileSystem.readFile(filePath)`（底层是 Node `fs/promises.readFile`）读取为 Buffer
2. 用 `new TextDecoder("utf-8", { ignoreBOM: true }).decode(buffer)` 解码为字符串
3. 检测并保留 BOM 信息

文件系统通过 `AppFileSystem`（`packages/core/src/filesystem.ts`）封装，基于 Effect 框架的 `NodeFileSystem`。

### 对比表

| 项目 | API | 同步/异步 | 编码检测 | 大小限制 |
|------|-----|----------|---------|---------|
| Claude Code | `fs.readFileSync()` | 同步 | BOM 检测（前 4096 字节） | 1 GiB |
| Codex | `tokio::fs::read()` | 异步 | `String::from_utf8` | 512 MiB |
| OpenCode | `fs/promises.readFile()` | 异步 | TextDecoder + BOM | 无 |

## 写文件

### Claude Code — 原子写入

**调用链**：`FileEditTool.call()` → `writeTextContent()` → `writeFileSyncAndFlush_DEPRECATED()`

`writeFileSyncAndFlush_DEPRECATED`（`src/utils/file.ts:362`）实现原子写入：

1. 解析符号链接得到真实路径
2. 生成临时文件路径：`` `${targetPath}.tmp.${process.pid}.${Date.now()}` ``
3. 用 `fs.statSync(targetPath)` 读取原文件权限
4. 写入临时文件：`fs.writeFileSync(tempPath, content, { encoding, flush: true })`
5. 复制权限：`fs.chmodSync(tempPath, targetMode)`
6. 原子重命名：`fs.renameSync(tempPath, targetPath)`（POSIX 上是原子操作）
7. 失败时清理临时文件，降级为直接 `fs.writeFileSync(targetPath, content)`

`writeTextContent` 还会处理 CRLF 行尾：如果原文件用 `\r\n`，写入前会把 `\n` 转回 `\r\n`。

### Codex — 直接覆写

**调用链**：`apply_patch()` → `fs.write_file(path, bytes)` → `tokio::fs::write(path, contents)`

`DirectFileSystem::write_file`（`local_file_system.rs:257`）：

```rust
tokio::fs::write(path.as_path(), contents).await
```

一步到位，直接覆盖目标文件。没有临时文件、没有原子操作。

如果父目录不存在，`write_file_with_missing_parent_retry()`（`lib.rs:614`）会捕获 `NotFound` 错误，递归创建目录后重试。

### OpenCode — 直接覆写

**调用链**：`edit.ts execute()` → `afs.writeWithDirs(filePath, content)` → `fs.writeFileString(path, content)`

`writeWithDirs`（`packages/core/src/filesystem.ts:97`）：

```typescript
const write = typeof content === "string"
  ? fs.writeFileString(path, content)
  : fs.writeFile(path, content)
```

直接使用 Effect 框架的 `FileSystem.writeFileString`（底层是 Node `fs/promises.writeFile`）。

如果写入失败（目录不存在），会递归创建目录后重试。写入后还会运行格式化（formatter）并同步 BOM。

### 对比表

| 项目 | API | 原子写入 | 权限保留 | 目录自动创建 | 写后格式化 |
|------|-----|:-------:|:-------:|:-----------:|:---------:|
| Claude Code | `fs.writeFileSync` + `renameSync` | ✅ | ✅ | ❌ | ❌ |
| Codex | `tokio::fs::write` | ❌ | ❌ | ✅ | ❌ |
| OpenCode | `fs/promises.writeFile` | ❌ | ❌ | ✅ | ✅ |

## 内存中的修改模式

三个项目都是**读进内存 → 修改字符串 → 写回硬盘**：

| 项目 | 读入格式 | 修改方式 | 写出格式 |
|------|---------|---------|---------|
| Claude Code | JS `string` | `String.replace()` / `replaceAll()` | JS `string` |
| Codex | Rust `String` → `Vec<String>`（按行分割） | 行级 splice（从后往前应用） | `String`（行用 `\n` 拼接） |
| OpenCode | JS `string` | `substring()` 拼接（8 级匹配策略） | JS `string` |

## 关键源码路径

```
claude-code-src/
├── src/tools/FileEditTool/
│   ├── FileEditTool.ts      # Edit 工具主逻辑
│   └── utils.ts             # applyEditToFile() 核心替换
├── src/tools/FileWriteTool/
│   └── FileWriteTool.ts     # Write 工具主逻辑
├── src/utils/
│   ├── file.ts              # writeTextContent(), writeFileSyncAndFlush_DEPRECATED()
│   ├── fileRead.ts          # readFileSyncWithMetadata()
│   └── fsOperations.ts      # NodeFsOperations 封装

codex/codex-rs/
├── apply-patch/src/
│   ├── lib.rs               # apply_patch() 入口, compute_replacements(), apply_replacements()
│   ├── parser.rs            # patch 格式解析器
│   ├── seek_sequence.rs     # 四级模糊匹配算法
│   └── streaming_parser.rs  # 流式 patch 解析
├── file-system/src/lib.rs   # ExecutorFileSystem trait
└── exec-server/src/
    └── local_file_system.rs # DirectFileSystem 实现 (tokio::fs)

opencode/packages/
├── opencode/src/tool/
│   ├── edit.ts              # Edit 工具 + 8 级匹配策略
│   ├── write.ts             # Write 工具
│   └── apply_patch.ts       # Patch 工具
├── opencode/src/util/
│   └── bom.ts               # BOM 检测和处理
└── core/src/
    └── filesystem.ts        # AppFileSystem (writeWithDirs)
```
