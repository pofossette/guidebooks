# Terminal/Shell 解决方案：Claude Code / OpenCode / Codex 实现分析

> 分析日期：2026-06-01
> 源码目录：`/home/wunai/Disks/Data/my-project/project-for-reference/`

## 核心结论

三者都采用**统一代码层 + 运行时翻译**的架构——不生成 `.sh` / `.ps1` 平台脚本，而是在代码中根据检测到的 shell 类型动态构造 `spawn()` 参数。

---

## 一、架构总览

```
┌─────────────┬──────────────────────┬────────────────────┬──────────────────────┐
│             │ Claude Code (TS/Bun) │ OpenCode (TS/Bun)  │ Codex (Rust/Tokio)   │
├─────────────┼──────────────────────┼────────────────────┼──────────────────────┤
│ 抽象层       │ ShellProvider 接口   │ Shell 模块+元数据表 │ ShellType 枚举       │
│             │ + 2 个实现           │ + args() 函数       │ + derive_exec_args() │
├─────────────┼──────────────────────┼────────────────────┼──────────────────────┤
│ Tool 数量    │ 双 Tool              │ 单 Tool             │ 单 Tool              │
│             │ BashTool+PowerShell  │ shell.ts            │ exec 模块            │
├─────────────┼──────────────────────┼────────────────────┼──────────────────────┤
│ 平台检测     │ process.platform     │ process.platform    │ #[cfg()] 编译期      │
│             │ + WSL /proc/version  │ === "win32"         │ + getpwuid_r 运行时  │
├─────────────┼──────────────────────┼────────────────────┼──────────────────────┤
│ Shell 发现   │ $SHELL 环境变量      │ /etc/shells (Unix)  │ /etc/passwd → which  │
│             │                      │ which 链 (Windows)  │ → fallback 路径      │
├─────────────┼──────────────────────┼────────────────────┼──────────────────────┤
│ Login Shell  │ Snapshot 机制        │ 每次 -l + source rc │ use_login_shell 参数 │
├─────────────┼──────────────────────┼────────────────────┼──────────────────────┤
│ PS 命令编码  │ Base64 UTF-16LE      │ 普通 -Command       │ 普通 -Command        │
│             │ (-EncodedCommand)    │                     │                      │
├─────────────┼──────────────────────┼────────────────────┼──────────────────────┤
│ 沙箱        │ Seatbelt + Landlock  │ 无内置沙箱          │ Seccomp/Landlock     │
│             │                      │                     │ + Windows Token      │
└─────────────┴──────────────────────┴────────────────────┴──────────────────────┘
```

---

## 二、各项目详细实现

### 2.1 Claude Code — Provider 模式 + Snapshot 机制

**文件结构：**

```
src/utils/
├── platform.ts                    # 平台检测 (macos|windows|wsl|linux)
├── Shell.ts                       # 统一 exec() 入口
├── shell/
│   ├── shellProvider.ts           # ShellProvider 接口定义
│   ├── bashProvider.ts            # bash/zsh 实现
│   ├── powershellProvider.ts      # PowerShell 实现
│   └── shellToolUtils.ts          # Tool 注册门控
└── bash/
    ├── ShellSnapshot.ts           # 环境快照机制
    ├── shellQuote.ts              # 引号处理
    └── shellQuoting.ts            # 命令安全转义
```

**ShellProvider 接口** (`shellProvider.ts`)：

```typescript
export type ShellProvider = {
  type: ShellType            // 'bash' | 'powershell'
  shellPath: string
  detached: boolean
  buildExecCommand(command, opts)  // 构建完整命令字符串
  getSpawnArgs(commandString)      // 返回 spawn 参数
  getEnvironmentOverrides(command) // 额外环境变量
}
```

**Bash 路径** (`bashProvider.ts`)：

spawn 参数：
```typescript
getSpawnArgs(commandString: string): string[] {
  return ['-c', ...(skipLoginShell ? [] : ['-l']), commandString]
}
```

命令链结构：
```
source /tmp/snapshot-zsh-xxx.sh 2>/dev/null || true
&& <session_environment_script>
&& shopt -u extglob 2>/dev/null || true      # 安全：禁用 extglob
&& eval '<user_command>'                       # eval 使 alias 生效
&& pwd -P >| /tmp/claude-1-cwd               # 追踪 cwd 变化
```

**Snapshot 机制** (`ShellSnapshot.ts`)：

Claude Code 的核心创新。启动时一次性创建 shell 环境快照：

1. 以 login shell (`-c -l`) 启动 bash/zsh
2. source 用户的 `.bashrc` / `.zshrc`
3. 将当前环境中的 **函数**、**shell 选项**、**别名** 导出到一个 `.sh` 文件
4. 后续每个命令 `source` 这个快照文件，跳过 `-l` 登录流程

优势：避免每次命令都付出 login shell 的启动开销（source `.zshrc` 可能耗时数百毫秒）。

**PowerShell 路径** (`powershellProvider.ts`)：

```typescript
export function buildPowerShellArgs(cmd: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', cmd]
}
```

沙箱模式下的关键设计——Base64 编码：
```typescript
function encodePowerShellCommand(psCommand: string): string {
  return Buffer.from(psCommand, 'utf16le').toString('base64')
}
// 沙箱路径: pwsh -NoProfile -NonInteractive -EncodedCommand <base64>
```

原因：沙箱 (`bwrap`) 的 shellquote 层会破坏 PowerShell 特殊字符（`!$?` → `\!$?`），
Base64 输出仅含 `[A-Za-z0-9+/=]`，免疫任何 quoting 层。

**PowerShell 门控** (`shellToolUtils.ts`)：

```typescript
export function isPowerShellToolEnabled(): boolean {
  if (getPlatform() !== 'windows') return false          // 非 Windows 直接禁用
  return process.env.USER_TYPE === 'ant'
    ? !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)  // 内部默认开
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)         // 外部默认关
}
```

**关键发现：外部用户在 Windows 上只能看到 BashTool，PowerShell 默认关闭。**

**Windows 上的 Bash 方案**：

Claude Code 在 Windows 上使用 **Git Bash**（来自 Git for Windows）。
证据散布在多处：

- `bashProvider.ts:109-110`：Windows 路径转 POSIX
  ```typescript
  const isWindows = getPlatform() === 'windows'
  const shellTmpdir = isWindows ? windowsPathToPosixPath(tmpdir) : tmpdir
  ```
- `ShellSnapshot.ts:48-51`：Windows (msys/cygwin) 的 ARGV0 特殊处理
  ```typescript
  elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    ARGV0=${argv0} ${quotedPath} ${argSuffix}  # exec -a 在 Windows 不工作
  ```
- `ShellSnapshot.ts:255-258`：过滤 winpty 别名
  ```bash
  if [[ "$OSTYPE" == "msys" ]]; then
    alias | grep -v "='winpty "  # Git Bash 自动创建的 winpty 别名会破坏非 TTY 环境
  ```

---

### 2.2 OpenCode — 单模块 + 元数据表

**文件结构：**

```
packages/opencode/src/
├── shell/
│   └── shell.ts           # Shell 发现、选择、命令构建（全部在一个文件）
└── tool/
    └── shell.ts           # Shell Tool 定义（单 Tool 处理所有 shell）
```

**元数据表** (`shell.ts`)：

```typescript
const META: Record<string, { deny?: boolean; login?: boolean; posix?: boolean; ps?: boolean }> = {
  bash:       { login: true, posix: true },
  dash:       { login: true, posix: true },
  fish:       { deny: true, login: true },    // 被拒绝 — 不支持
  ksh:        { login: true, posix: true },
  nu:         { deny: true },                 // 被拒绝 — 不支持
  powershell: { ps: true },
  pwsh:       { ps: true },
  sh:         { login: true, posix: true },
  zsh:        { login: true, posix: true },
}
```

`deny: true` 意味着该 shell 不会被选为默认 shell，但用户仍可手动配置。

**命令构建** (`args()` 函数)：

```typescript
export function args(file: string, command: string, cwd: string) {
  const n = name(file)

  // zsh: source 两个 rc 文件
  if (n === "zsh") return ["-l", "-c", `
    [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
    [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source ... || true
    cd -- "$1"
    eval ${JSON.stringify(command)}
  `, "opencode", cwd]

  // bash: source bashrc + 开启 alias 展开
  if (n === "bash") return ["-l", "-c", `
    shopt -s expand_aliases
    [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
    cd -- "$1"
    eval ${JSON.stringify(command)}
  `, "opencode", cwd]

  // cmd.exe
  if (n === "cmd") return ["/c", command]

  // PowerShell / pwsh
  if (ps(file)) return ["-NoProfile", "-Command", command]

  // 兜底 POSIX
  return ["-c", command]
}
```

与 Claude Code 的关键差异：
- **无 Snapshot**：每次命令都 `-l` + source rc 文件（简单但有启动开销）
- **cwd 通过参数传递**：`cd -- "$1"` 配合第 5 个参数 `"opencode"` 后的 `cwd`
- **eval + JSON.stringify**：用 JSON 序列化保证命令字符串安全

**进程管理**：

```typescript
// 杀死进程树
export async function killTree(proc: ChildProcess) {
  if (process.platform === "win32") {
    // Windows: taskkill /pid PID /f /t
  } else {
    process.kill(-pid, "SIGTERM")   // 负 PID = 杀整个进程组
    await sleep(200)
    process.kill(-pid, "SIGKILL")   // 200ms 后强杀
  }
}
```

**Tree-Sitter 解析** (`tool/shell.ts`)：

OpenCode 用 tree-sitter WASM 解析命令 AST，判断命令是只读操作还是文件修改操作，
用于权限系统的自动审批：

```typescript
const parser = lazy(async () => {
  const bash = new Parser()
  bash.setLanguage(bashLanguage)    // tree-sitter-bash.wasm
  const ps = new Parser()
  ps.setLanguage(psLanguage)        // tree-sitter-powershell.wasm
  return { bash, ps }
})
```

**Shell 选择**（`cmd()` 函数）：

```typescript
function cmd(shell: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {
  if (process.platform === "win32" && Shell.ps(shell)) {
    // Windows PowerShell: 显式传参
    return ChildProcess.make(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], ...)
  }
  // 其他所有 shell: 通过 shell 参数启动
  return ChildProcess.make(command, [], { shell, ... })
}
```

---

### 2.3 Codex — Rust 枚举 + 编译期条件

**文件结构：**

```
codex-rs/core/src/
├── shell.rs              # ShellType 枚举 + Shell 结构体 + derive_exec_args()
├── shell_detect.rs       # Shell 路径 → ShellType 映射
├── shell_snapshot.rs     # Shell 环境快照
├── exec.rs               # 命令执行引擎（沙箱路由 + 输出收集）
├── spawn.rs              # tokio::process::Command 构建
└── sandboxing/           # 沙箱抽象（Landlock/Seccomp/Seatbelt/Windows Token）
```

**ShellType 枚举** (`shell.rs`)：

```rust
pub enum ShellType {
    Zsh,
    Bash,
    PowerShell,
    Sh,
    Cmd,
}
```

**命令构建** (`derive_exec_args`)：

```rust
pub fn derive_exec_args(&self, command: &str, use_login_shell: bool) -> Vec<String> {
    match self.shell_type {
        // POSIX shells: -lc (login) 或 -c
        ShellType::Zsh | ShellType::Bash | ShellType::Sh => {
            let arg = if use_login_shell { "-lc" } else { "-c" };
            vec![shell_path, arg, command]
        }
        // PowerShell: -NoProfile 可选 + -Command
        ShellType::PowerShell => {
            let mut args = vec![shell_path];
            if !use_login_shell { args.push("-NoProfile"); }
            args.push("-Command");
            args.push(command);
            args
        }
        // cmd.exe: /c
        ShellType::Cmd => {
            vec![shell_path, "/c", command]
        }
    }
}
```

**Shell 检测** (`shell_detect.rs`)：

```rust
pub fn detect_shell_type(shell_path: &PathBuf) -> Option<ShellType> {
    match shell_path.as_os_str().to_str() {
        Some("zsh") => Some(ShellType::Zsh),
        Some("pwsh") | Some("powershell") => Some(ShellType::PowerShell),
        Some("bash") => Some(ShellType::Bash),
        Some("sh") => Some(ShellType::Sh),
        Some("cmd") | Some("cmd.exe") => Some(ShellType::Cmd),
        _ => {
            // 递归解析文件名：/bin/zsh → "zsh" → 匹配
            let shell_name = shell_path.file_stem();
            if let Some(name) = shell_name {
                let name_path = Path::new(name);
                if name_path != Path::new(shell_path) {
                    return detect_shell_type(&name_path.to_path_buf());
                }
            }
            None
        }
    }
}
```

**默认 Shell 选择** (`shell.rs:312-336`)：

```rust
fn default_user_shell_from_path(user_shell_path: Option<PathBuf>) -> Shell {
    if cfg!(windows) {
        // Windows: 硬编码 PowerShell 为默认，不读 $SHELL
        get_shell(ShellType::PowerShell, None).unwrap_or(ultimate_fallback_shell())
    } else {
        // Unix: 读 /etc/passwd 的 pw_shell 字段
        let user_default = user_shell_path
            .and_then(|s| detect_shell_type(&s))
            .and_then(|t| get_shell(t, None));

        // macOS 优先 zsh，Linux 优先 bash
        if cfg!(target_os = "macos") {
            user_default.or_else(|| get_shell(Zsh)).or_else(|| get_shell(Bash))
        } else {
            user_default.or_else(|| get_shell(Bash)).or_else(|| get_shell(Zsh))
        }
    }
}
```

**进程 spawn** (`spawn.rs`)：

```rust
pub async fn spawn_child_async(request: SpawnChildRequest<'_>) -> io::Result<Child> {
    let mut cmd = Command::new(&program);

    #[cfg(unix)]
    cmd.arg0(arg0.unwrap_or(program.to_string_lossy()));  // Unix: 设置 argv[0]

    cmd.args(args);
    cmd.current_dir(cwd);
    cmd.env_clear();
    cmd.envs(env);

    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(move || {
            // 分离 TTY，创建独立进程组
            detach_from_tty()?;
            // Linux: 父进程死亡时收到 SIGTERM（prctl）
            #[cfg(target_os = "linux")]
            set_parent_death_signal(parent_pid)?;
            Ok(())
        });
    }

    cmd.stdin(Stdio::null())      // 不创建 stdin，避免 ripgrep 等命令挂起
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    cmd.kill_on_drop(true).spawn()  // Drop 时自动杀子进程
}
```

---

## 三、两个关键问题

### 3.1 为什么 Codex 在 Windows 上运行 pwsh 命令？

**根因：硬编码 PowerShell 为 Windows 默认 shell。**

`codex-rs/core/src/shell.rs:317-318`：

```rust
if cfg!(windows) {
    get_shell(ShellType::PowerShell, /*path*/ None).unwrap_or(ultimate_fallback_shell())
}
```

这段代码在 Windows 上**完全忽略**用户的 shell 偏好——不读 `$SHELL` 环境变量，
不查 `/etc/passwd`（Windows 也没有），直接选 PowerShell。

**fallback 链**（`get_powershell_shell`）：

```
1. which("pwsh")       → PowerShell 7+（跨平台版）
2. which("powershell") → Windows PowerShell 5.1
3. C:\Program Files\PowerShell\7\pwsh.exe
4. C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
5. ultimate_fallback → cmd.exe
```

**设计意图**：Windows 上 PowerShell 是最完整的 shell（支持管道、对象、远程管理），
cmd.exe 功能过于受限。Codex 团队判断在 Windows 上统一用 PowerShell 是最安全的选择。

**与 Claude Code 的对比**：Claude Code 在 Windows 上用 Git Bash（POSIX 兼容层），
Codex 用原生 PowerShell。这导致 AI 生成的 shell 命令在两个工具间不可移植——
Codex 需要生成 PowerShell 语法（`Get-ChildItem`、`$env:PATH`），
Claude Code 需要生成 bash 语法（`ls`、`$PATH`）。

### 3.2 为什么 Claude Code 在各个平台都能看到 bash？

**根因：PowerShell 被门控，默认关闭；Windows 上用 Git Bash 兜底。**

三层机制共同作用：

**第一层：PowerShell Tool 的门控**（`shellToolUtils.ts`）：

```typescript
export function isPowerShellToolEnabled(): boolean {
  if (getPlatform() !== 'windows') return false              // 非 Windows → 禁用
  return process.env.USER_TYPE === 'ant'
    ? !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)  // 内部：默认开
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)         // 外部：默认关
}
```

外部用户（非 Anthropic 内部）必须**显式设置** `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` 才能启用。
这意味着绝大多数用户在所有平台上都只能使用 BashTool。

**第二层：Bash Provider 的 Windows 适配**（`bashProvider.ts`）：

BashTool 内部做了大量 Windows/Git Bash 适配：

| 适配点 | 代码位置 | 处理方式 |
|--------|----------|----------|
| 路径转换 | `bashProvider.ts:110` | `windowsPathToPosixPath(tmpdir)` |
| Snapshot 中的 `$OSTYPE` | `ShellSnapshot.ts:48` | msys/cygwin/win32 → 用 ARGV0 代替 `exec -a` |
| winpty 别名过滤 | `ShellSnapshot.ts:255` | Git Bash 自动创建的 `winpty` 别名在非 TTY 环境会报错 |
| Cygwin PATH 读取 | `ShellSnapshot.ts:274` | `echo $PATH` 获取 Cygwin 格式的 PATH |
| `2>nul` 重定向修正 | `bashProvider.ts:127` | 将 Windows CMD 的 `2>nul` 改写为 `2>/dev/null` |

**第三层：Shell 发现机制**：

Claude Code 不像 Codex 那样硬编码 shell 类型。它读 `$SHELL` 环境变量。
在 Windows + Git Bash 环境中，安装 Git for Windows 通常会设置 `SHELL` 指向 bash。

**结果矩阵**：

```
┌───────────────┬──────────────────────┬──────────────────────────────────┐
│ 平台           │ 默认 shell           │ 原因                             │
├───────────────┼──────────────────────┼──────────────────────────────────┤
│ macOS          │ /bin/zsh             │ $SHELL 通常是 zsh                │
│ Linux          │ /bin/bash 或 /bin/zsh│ $SHELL 通常是 bash/zsh           │
│ WSL            │ /bin/bash            │ WSL 默认 shell 是 bash           │
│ Windows (外部) │ Git Bash             │ PowerShell 门控关闭，Git Bash 兜底│
│ Windows (内部) │ Git Bash 或 pwsh     │ PowerShell 默认开，两者并存       │
└───────────────┴──────────────────────┴──────────────────────────────────┘
```

**深层设计动机**：

Claude Code 选择统一 bash 而非原生 PowerShell 的原因：

1. **AI 模型的命令生成能力**：LLM 训练数据中 bash 命令远多于 PowerShell，
   统一 bash 减少模型生成错误命令的概率
2. **跨平台一致性**：同一套 prompt 指令在所有平台产生相同行为
3. **Git Bash 的 POSIX 兼容层**：在 Windows 上提供 `ls`、`grep`、`find` 等 Unix 工具，
   与 macOS/Linux 行为一致
4. **Snapshot 机制的可移植性**：一套 snapshot 逻辑适配 bash/zsh，不需要再为 PowerShell 写一套

---

## 四、Shell 命令参数速查表

| Shell | 登录 Shell | 非登录 Shell | 说明 |
|-------|-----------|-------------|------|
| bash  | `bash -lc "cmd"` | `bash -c "cmd"` | `-l` 加载 .bash_profile/.profile |
| zsh   | `zsh -lc "cmd"` | `zsh -c "cmd"` | `-l` 加载 .zshenv/.zshrc |
| sh    | `sh -lc "cmd"` | `sh -c "cmd"` | POSIX |
| pwsh  | `pwsh -Command "cmd"` | `pwsh -NoProfile -Command "cmd"` | `-NoProfile` 跳过 profile 加载 |
| cmd   | `cmd /c "cmd"` | 同左 | cmd.exe 没有 login 概念 |

---

## 五、进程管理对比

| 维度 | Claude Code | OpenCode | Codex |
|------|-------------|----------|-------|
| 进程组 | tree-kill npm 包 | `process.kill(-pid)` 负 PID | `detach_from_tty()` + 进程组 |
| 超时 | Tool 级别控制 | Tool 级别 + Effect.raceAll | ExecExpiration 枚举 |
| 强杀 | tree-kill (递归) | SIGTERM → 200ms → SIGKILL | kill_child_process_group |
| Windows 杀进程 | tree-kill 内部处理 | `taskkill /pid PID /f /t` | `kill_on_drop(true)` |
| 父进程死亡 | 无特殊处理 | 无特殊处理 | Linux: `prctl(PR_SET_PDEATHSIG)` |

---

## 六、安全机制对比

| 维度 | Claude Code | OpenCode | Codex |
|------|-------------|----------|-------|
| 命令转义 | shellQuote + shellQuoting | JSON.stringify + eval | Rust 类型安全 |
| 沙箱 | macOS Seatbelt + Linux Landlock + bubblewrap | 无 | Linux Seccomp/Landlock + Windows restricted token |
| 文件系统 | sandboxTmpDir 隔离 | 无 | WorkspaceWrite 策略 |
| 网络 | 无特殊限制 | 无 | NetworkSandboxPolicy |
| PS Base64 | 有（防 quoting 注入） | 无 | 无 |
| extglob 禁用 | 有（防恶意文件名扩展） | 无 | 无 |

---

## 七、设计哲学总结

| | Claude Code | OpenCode | Codex |
|---|---|---|---|
| **设计重心** | 跨平台一致性 + 安全深度 | 简洁实用 | 原生性能 + 编译期保证 |
| **shell 选择** | 统一用 bash（Git Bash on Windows） | 检测用户 shell，适配 | Windows 硬编码 PowerShell |
| **环境初始化** | Snapshot（一次性快照） | 每次 source rc 文件 | Shell snapshot（类似 Claude Code） |
| **适用场景** | 需要 bash 一致性的 AI agent | 需要用户原生环境的工具 | Windows 原生开发 |
| **取舍** | 丢失 PowerShell 生态 | 每次 source 的启动开销 | bash 命令在 Windows 不可用 |
