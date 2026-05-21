# Claude Code / Codex / OpenCode 沙箱安全能力对比分析

## 一、总体架构对比

| 维度 | Claude Code | Codex (OpenAI) | OpenCode |
|------|------------|----------------|----------|
| **沙箱层** | OS 级沙箱 | OS 级沙箱 | **无沙箱** |
| **Linux 机制** | Bubblewrap + Seccomp-BPF | Bubblewrap + Seccomp + Landlock | 无 |
| **macOS 机制** | Seatbelt (sandbox-exec) | Seatbelt (sandbox-exec) | 无 |
| **Windows 机制** | 不支持 | 受限令牌 + WFP 防火墙 | 无 |
| **安全定位** | 真正的安全隔离 | 真正的安全隔离 | UX 提示系统 |

---

## 二、Claude Code 沙箱实现

### 2.1 总体架构

Claude Code 的沙箱系统采用**分层架构**，核心由 `@anthropic-ai/sandbox-runtime` 包提供底层沙箱实现，Claude Code 源码中的 `sandbox-adapter.ts` 作为适配层进行集成。系统同时支持 macOS 和 Linux/WSL2 两个平台。

核心文件分布：
- **适配层**：`src/utils/sandbox/sandbox-adapter.ts` -- 将设置系统、工具集成桥接到 sandbox-runtime
- **底层沙箱运行时**：`node_modules/@anthropic-ai/sandbox-runtime/dist/sandbox/` 目录

### 2.2 Linux 平台：Bubblewrap (bwrap) + Seccomp-BPF

Linux 沙箱使用 Bubblewrap 作为主要隔离工具。核心函数 `wrapCommandWithSandboxLinux()` 构造 bwrap 命令，执行流程分为**两阶段**：

**阶段 1 -- 外层 bwrap（网络和文件系统隔离）：**

关键 bwrap 参数：
- `--new-session`：创建新会话，脱离终端控制
- `--die-with-parent`：父进程退出时自动终止
- `--unshare-net`：完全隔离网络命名空间，移除所有网络接口
- `--unshare-pid`：隔离 PID 命名空间（防止沙箱逃逸）
- `--proc /proc`：挂载新的 /proc 文件系统
- `--ro-bind / /`：将根文件系统挂载为只读
- `--dev /dev`：挂载设备文件
- `--bind`：将特定可写路径挂载为读写
- `--setenv`：设置代理环境变量

**阶段 2 -- apply-seccomp（Unix Socket 阻断）：**

`apply-seccomp` 是一个预编译的 C 程序（位于 `vendor/seccomp/{x64,arm64}/`），执行：
1. 设置 `PR_SET_NO_NEW_PRIVS`
2. 通过 `prctl(PR_SET_SECCOMP)` 应用 seccomp BPF 过滤器
3. exec 用户命令

Seccomp 过滤范围：
- 阻止 `socket(AF_UNIX, ...)` 系统调用，防止创建新 Unix domain socket
- 不阻止对继承的 Unix socket FD 的操作
- 不阻止通过 SCM_RIGHTS 传递的 Unix socket FD
- 仅支持 x64 和 arm64 架构

### 2.3 macOS 平台：Seatbelt (sandbox-exec)

macOS 使用内核级的 Seatbelt 沙箱机制，通过 `sandbox-exec -p <profile>` 执行沙箱化命令。

Profile 结构：
```
(version 1)
(deny default (with message "<logTag>"))
(allow process-exec)
(allow process-fork)
...
```

关键特性：
- 使用 `(deny default)` 作为默认策略，拒绝所有未明确允许的操作
- 仅允许必要的系统服务（如 `com.apple.logd`、`com.apple.fonts` 等有限的 Mach IPC 服务）
- 沙箱违规通过日志监控器捕获并报告

### 2.4 网络隔离

**Linux**：使用 `--unshare-net` 创建完全隔离的网络命名空间，所有网络被默认阻断。通过以下架构实现受控的网络访问：

1. **宿主机侧**：运行 socat 桥接进程，监听 Unix socket 并转发到宿主机代理服务器
2. **沙箱内侧**：将 Unix socket 绑定进隔离命名空间，运行 socat 监听器
   - HTTP 监听器（端口 3128）→ HTTP Unix socket → 宿主机 HTTP 代理
   - SOCKS 监听器（端口 1080）→ SOCKS Unix socket → 宿主机 SOCKS5 代理

**macOS**：通过 Seatbelt profile 中的网络规则控制：
- `(allow network-bind (local ip "localhost:<port>"))` -- 允许本地代理端口绑定
- `(allow network-outbound (remote ip "localhost:<port>"))` -- 允许连接到本地代理
- 默认拒绝其他所有网络操作

**HTTP 代理域名过滤**：
- 对每个请求调用 `filterNetworkRequest()` 进行域名检查
- 先检查 `deniedDomains`（拒绝列表优先）
- 再检查 `allowedDomains`（允许列表）
- 无匹配规则时，询问用户或默认拒绝
- 支持通配符域名模式（如 `*.npmjs.org`）

### 2.5 文件系统限制

**Linux 文件系统绑定挂载** (`generateFilesystemArgs()`)：
- 初始以只读挂载根文件系统：`--ro-bind / /`
- 允许写入的路径通过 `--bind` 挂载为读写
- 拒绝写入的路径通过 `--ro-bind` 挂载为只读
- 不存在的拒绝路径：在第一个不存在的路径组件上挂载 `/dev/null`，阻止其被创建
- 读取拒绝路径：通过 `--tmpfs` 覆盖目录，或 `--ro-bind /dev/null` 覆盖文件

**macOS 文件系统规则** (Seatbelt profile)：
- 读取：默认允许所有读取，拒绝特定路径，重新允许子路径
- 写入：允许当前目录写入，拒绝危险文件写入
- 文件移动阻断：阻止 `mv`/`rename` 操作绕过限制

**强制拒绝路径** (`DANGEROUS_FILES` 和 `DANGEROUS_DIRECTORIES`)：
```javascript
DANGEROUS_FILES = [
    '.gitconfig', '.gitmodules', '.bashrc', '.bash_profile',
    '.zshrc', '.zprofile', '.profile', '.ripgreprc', '.mcp.json',
]
DANGEROUS_DIRECTORIES = ['.git', '.vscode', '.idea']
```

**拒绝写入列表（始终包含）**：
- 所有 `settings.json` 文件（防止沙箱逃逸）
- `.claude/commands`、`.claude/agents`、`.claude/skills` 目录
- 裸仓库文件（`HEAD`、`objects`、`refs`、`hooks`、`config`）-- 防止 git 裸仓库攻击

### 2.6 安全防护措施

- **符号链接安全**：`findSymlinkInPath()` 检测路径中的符号链接，防止符号链接替换攻击
- **裸仓库防护**：`scrubBareGitRepoFiles()` 检测并清理可能被攻击者放置的裸仓库文件，防止利用 `core.fsmonitor` 逃逸
- **大小写规范化**：`normalizeCaseForComparison()` 在大小写不敏感文件系统上统一比较，防止混合大小写绕过（如 `.cLauDe/Settings.locaL.json`）
- **文件移动阻断**：阻止通过 `mv`/`rename` 绕过读取/写入限制

### 2.7 权限系统

权限配置来自多个来源（按优先级排序）：
1. **policySettings**（策略设置）-- 最高优先级
2. **flagSettings**（标志设置）
3. **localSettings**（本地设置）
4. **userSettings**（用户设置）
5. **项目设置**（`.claude/settings.json`）

用户可通过 `/sandbox` 命令访问沙箱设置界面：
- "Sandbox BashTool, with auto-allow" -- 沙箱自动允许 Bash 命令
- "Sandbox BashTool, with regular permissions" -- 沙箱配合常规权限
- "No Sandbox" -- 禁用沙箱

### 2.8 代理环境变量

为沙箱内进程设置全面的代理环境变量：
- `HTTP_PROXY`、`HTTPS_PROXY`（大小写两种形式）
- `ALL_PROXY`（SOCKS5 代理）
- `GIT_SSH_COMMAND`（SSH 通过代理）
- `NO_PROXY`（排除 localhost 和私有网络）
- `DOCKER_HTTP_PROXY`、`CLOUDSDK_PROXY_*`、`GRPC_PROXY` 等

### 2.9 平台支持

- macOS：完整支持（Seatbelt + sandbox-exec）
- Linux：完整支持（Bubblewrap + socat + seccomp）
- WSL2：支持（等同于 Linux）
- WSL1：不支持（bwrap 不兼容）
- Windows：不支持

---

## 三、Codex 沙箱实现

### 3.1 总体架构

Codex 支持三大操作系统的沙箱机制，通过统一的 `SandboxManager` 进行调度选择。

`SandboxType` 枚举定义了四种沙箱类型：
```rust
pub enum SandboxType {
    None,
    MacosSeatbelt,
    LinuxSeccomp,
    WindowsRestrictedToken,
}
```

核心 crate 分布：
- `codex-rs/sandboxing/` -- 沙箱类型选择和命令转换
- `codex-rs/linux-sandbox/` -- Linux 沙箱辅助程序（bwrap 参数构建 + seccomp 应用）
- `codex-rs/network-proxy/` -- 网络代理和策略控制
- `codex-rs/windows-sandbox-rs/` -- Windows 受限令牌和防火墙

### 3.2 Linux -- Bubblewrap + Seccomp + Landlock

这是最复杂的沙箱实现，由三个 crate 协作完成。

**执行流程**（`linux_run_main.rs`）：
```
1. 解析权限配置
2. 如果有应用 seccomp 后再 exec 的需求（内层阶段），激活代理路由后应用 seccomp 限制，然后 execvp
3. 如果是完整磁盘写入且无代理路由，直接应用 seccomp 后 execvp
4. 否则（默认路径）：先用 bubblewrap 建立文件系统视图，再进入内层阶段应用 seccomp，最后 execvp
5. 传统路径：Landlock 文件系统限制 + seccomp
```

**Bubblewrap 文件系统隔离**（`linux-sandbox/src/bwrap.rs`，约 2700 行）：
- `--ro-bind / /`：默认将整个文件系统挂载为只读
- `--bind <root> <root>`：为显式可写根目录重新挂载为读写
- `--ro-bind <subpath> <subpath>`：在可写根目录下重新应用只读保护（如 `.git`、`.codex`、`.agents`）
- `--unshare-user`：隔离用户命名空间
- `--unshare-pid`：隔离 PID 命名空间
- `--unshare-net`：隔离网络命名空间（网络受限或代理模式时）
- `--new-session` 和 `--die-with-parent`：会话隔离
- `--proc /proc`：挂载全新的 /proc（可通过 `--no-proc` 禁用）

**Seccomp 网络过滤**（`linux-sandbox/src/landlock.rs`）：

无条件禁止的系统调用：
- `ptrace`、`process_vm_readv`、`process_vm_writev`
- `io_uring_setup`、`io_uring_enter`、`io_uring_register`

两种网络过滤模式：
- **Restricted 模式**：禁止 `connect`、`accept`、`accept4`、`bind`、`listen`、`sendto`、`sendmmsg`、`recvmmsg` 等网络系统调用；`socket` 和 `socketpair` 仅允许 `AF_UNIX`
- **ProxyRouted 模式**：允许 `AF_INET`/`AF_INET6`（用于连接本地 TCP 桥接），但禁止 `AF_UNIX` socketpair（防止绕过代理路由）

使用 `seccompiler` crate 构建 BPF 过滤器，在应用 seccomp 前先调用 `PR_SET_NO_NEW_PRIVS`。

**Landlock（传统回退路径）**：
- 使用 Landlock ABI V5
- 对 `/` 和所有文件系统根应用只读规则
- 对 `/dev/null` 和指定的可写根应用读写规则
- 通过 `features.use_legacy_landlock = true` 显式启用

### 3.3 macOS -- Seatbelt (sandbox-exec)

- 使用 macOS 原生 `sandbox-exec` 命令（严格锁定为 `/usr/bin/sandbox-exec` 以防止 PATH 注入攻击）
- 基础策略模板：`(deny default)` 一切禁止，按需允许进程执行、fork、sysctl 读取、Mach IPC
- 网络策略模板：仅允许 `AF_SYSTEM` socket 用于本地平台服务，允许 Mach lookup 特定系统服务

### 3.4 Windows -- 受限令牌 + WFP 防火墙

**受限令牌（Restricted Token）**：
- 通过 `CreateRestrictedToken` API 创建受限进程令牌
- 使用 `DISABLE_MAX_PRIVILEGE` 和 `LUA_TOKEN` 标志
- 移除默认 DACL 中的权限，设置限制性的安全描述符

**ACL 文件系统限制**：通过 Windows DACL 操作限制文件访问

**WFP（Windows Filtering Platform）网络过滤**：
- 安装持久性 WFP 提供者、子层和过滤器
- 按用户 SID 过滤网络流量
- 支持 TCP/UDP 协议级过滤

**Windows 防火墙规则**：
- 创建离线阻止规则（阻止非回传出站流量）
- 创建回环 TCP/UDP 阻止规则
- 创建代理允许例外规则

### 3.5 网络代理架构

**网络策略决策**（`NetworkPolicyDecider` trait）：
- `NetworkDecision::Allow` / `NetworkDecision::Deny { reason, source, decision }`
- 决策来源：`BaselinePolicy`、`ModeGuard`、`ProxyState`、`Decider`

**域名策略匹配**（`network_policy.rs`）：
- 非公开 IP 检测：阻止回环地址、私有地址（10.x、192.168.x 等）、CGNAT、链路本地、组播等
- 支持 `*.example.com`（严格子域）和 `**.example.com`（含顶域+子域）模式
- 拒绝全局通配符 `*` 模式作为 denylist

**网络隔离级别**（`BwrapNetworkMode`）：
```rust
pub(crate) enum BwrapNetworkMode {
    FullAccess,   // 完全访问主机网络命名空间
    Isolated,     // 移除主机网络命名空间访问
    ProxyOnly,    // 仅通过代理路由（内部TCP桥接）
}
```

### 3.6 权限系统

**权限合并逻辑**（`policy_transforms.rs`）：
- `merge_permission_profiles()`：合并基础权限和额外权限（网络：任一允许即允许；文件系统：条目合并去重）
- `intersect_permission_profiles()`：计算请求权限和授权权限的交集（严格取最小权限集）
- `effective_permission_profile()`：计算最终有效权限

**受保护的元数据路径名**：
- `.git` -- 版本控制元数据
- `.agents` -- 代理配置
- `.codex` -- Codex 配置

**Guardian 策略**：
- 定义数据泄露、凭证探测、持久化安全削弱、破坏性操作等风险分类
- 实施 allow/deny 规则，基于风险等级和用户授权级别

### 3.7 内置 Bubblewrap

- 当系统 bwrap 不可用时自动回退到内置版本
- 系统 bwrap 缺失或缺少用户命名空间权限时显示启动警告

---

## 四、OpenCode 安全机制

### 4.1 核心结论：没有传统沙箱

OpenCode **不使用任何操作系统级沙箱机制**。`SECURITY.md` 明确声明：

> **No Sandbox**: OpenCode does not sandbox the agent. The permission system exists as a UX feature to help users stay aware of what actions the agent is taking. However, it is not designed to provide security isolation.
> If you need true isolation, run OpenCode inside a Docker container or VM.

### 4.2 命令执行机制（无沙箱）

命令通过 `ChildProcess` 直接在主机上运行，不经过任何容器、虚拟机或命名空间隔离：

```typescript
function cmd(shell: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {
  return ChildProcess.make(command, [], {
    shell,
    cwd,
    env,
    stdin: "ignore",
    detached: process.platform !== "win32",
  })
}
```

### 4.3 权限系统（应用层 UX 提示）

**权限评估引擎**（`permission/index.ts`）：

三种动作：`allow`、`deny`、`ask`

评估逻辑：
1. 遍历所有 patterns，对每个 pattern 使用 `evaluate()` 函数匹配规则
2. 匹配到 `deny` 规则 → 立即返回 `DeniedError`
3. 匹配到 `allow` 规则 → 跳过
4. 无匹配或匹配到 `ask` → 向用户发送确认请求

采用"最后匹配优先"（`findLast`）策略，支持 `*` 和 `?` 通配符匹配。

**已知权限键**：`read`、`edit`、`glob`、`grep`、`list`、`bash`、`task`、`external_directory`、`todowrite`、`question`、`webfetch`、`websearch`、`lsp`、`doom_loop`、`skill`

### 4.4 文件系统限制（逻辑层检查）

**路径边界检查**（`instance-context.ts`）：
```typescript
export function containsPath(filepath: string, ctx: InstanceContext): boolean {
  if (AppFileSystem.contains(ctx.directory, filepath)) return true
  if (ctx.worktree === "/") return false
  return AppFileSystem.contains(ctx.worktree, filepath)
}
```

**外部目录权限**：当工具尝试访问项目边界外的路径时，触发 `external_directory` 权限确认。

各工具（read、edit、write、glob、shell）均在执行前调用 `assertExternalDirectoryEffect` 检查路径边界。

**tree-sitter 命令 AST 解析**：Shell 工具在执行前使用 tree-sitter 解析 bash/PowerShell 命令 AST，提取文件路径参数，对项目外路径触发权限确认。

### 4.5 Agent 级别权限配置

| Agent 类型 | 权限配置 |
|-----------|---------|
| **build**（默认） | 几乎全部允许，`doom_loop` 和 `external_directory` 需确认 |
| **plan**（规划模式） | 禁止所有编辑工具，仅允许写入特定计划文件 |
| **explore**（探索） | 仅允许只读工具（grep、glob、list、bash、read、webfetch、websearch） |
| **compaction/title/summary** | 全部禁止 |

### 4.6 Shell 超时机制

默认 2 分钟超时，超时后子进程被强制终止（先 SIGTERM，3 秒后 SIGKILL）。

### 4.7 网络隔离

**无网络隔离**。子进程直接使用 `process.env`，继承完整的宿主机网络环境。

---

## 五、Linux 沙箱实现详细对比

| 特性 | Claude Code | Codex |
|------|------------|-------|
| Bubblewrap | 依赖系统 bwrap | **内嵌 bwrap 二进制**，系统不可用时自动回退 |
| Seccomp-BPF | 仅阻断 `AF_UNIX` socket 创建 | 完整的网络 syscall 过滤 + 阻断 `ptrace`、`io_uring` |
| Landlock | 无 | 有（传统回退路径，ABI V5） |
| 命名空间隔离 | `--unshare-pid`、`--unshare-net` | `--unshare-user`、`--unshare-pid`、`--unshare-net` |
| 执行阶段 | 两阶段（bwrap → apply-seccomp） | 两阶段（bwrap 文件系统视图 → seccomp 进程限制） |

---

## 六、网络隔离详细对比

| 特性 | Claude Code | Codex | OpenCode |
|------|------------|-------|----------|
| 默认策略 | 完全断网 | 完全断网 | **完全开放** |
| 网络桥接 | socat Unix socket 桥接 | TCP → UDS → TCP 代理路由 | 无 |
| HTTP/SOCKS 代理 | 内置代理 + 域名过滤 | 内置代理 + 域名策略 | 无 |
| 域名过滤 | allowedDomains / deniedDomains | NetworkPolicyDecider（含 IP 私有地址检测） | 无 |
| Windows 网络 | N/A | WFP 过滤 + 防火墙规则 | 无 |

---

## 七、文件系统隔离详细对比

| 特性 | Claude Code | Codex | OpenCode |
|------|------------|-------|----------|
| 根文件系统 | `--ro-bind / /` 只读 | `--ro-bind / /` 或 `--tmpfs /` | 无 |
| 可写目录 | 显式 `--bind` 挂载 | 显式 `--bind` 挂载 | 逻辑检查 `containsPath()` |
| 受保护路径 | `settings.json`、`.claude/`、`.git/hooks`、`.gitconfig`、`.bashrc` 等 | `.git`、`.agents`、`.codex` | macOS TCC 目录 |
| 符号链接防护 | 检测并阻止符号链接逃逸 | fail-closed（跨越符号链接报错） | 无 |
| 大小写规范化 | 有（防大小写绕过） | 无 | 无 |
| 文件移动阻断 | 有（防 `mv` 绕过） | 无 | 无 |
| 裸仓库防护 | 有（防 `core.fsmonitor` 逃逸） | 无 | 无 |
| Glob 展开 | ripgrep 递归搜索 | ripgrep + globset walker（上限 8192） | 无 |

---

## 八、权限系统详细对比

| 特性 | Claude Code | Codex | OpenCode |
|------|------------|-------|----------|
| 权限层级 | policy > flag > local > user > project | PermissionProfile + intersect/merge | 纯通配符规则链 |
| 权限粒度 | 文件路径 + 域名 + 命令模式 | 文件系统 glob + 网络域 + 系统调用 | 工具级 + 路径级 |
| 安全强度 | OS 级强制执行 | OS 级强制执行 | **应用层提示**（可绕过） |
| 命令排除 | `/sandbox exclude` 排除特定命令 | Guardian 策略分级 | 命令前缀 arity 分析 |
| Agent 分级 | 无 | Guardian 风险分级 | build/plan/explore 分级 |

---

## 九、安全设计亮点总结

### Claude Code 的独特防护

1. **大小写规范化**：在大小写不敏感文件系统（macOS）上统一大小写比较，防止 `.cLauDe/Settings.locaL.json` 绕过
2. **文件移动阻断**：通过 Seatbelt `file-write-unlink` 阻止 `mv`/`rename` 绕过读写限制
3. **裸仓库防护**：检测并清理 `.git/HEAD`、`objects`、`refs`、`hooks`、`config`，防止 `core.fsmonitor` 逃逸
4. **符号链接检查**：`findSymlinkInPath()` 防止符号链接替换攻击
5. **不存在路径的 /dev/null 绑定**：阻止在沙箱内创建新的配置文件

### Codex 的独特防护

1. **三平台全覆盖**：Linux/macOS/Windows 全部支持 OS 级沙箱
2. **内嵌 bwrap**：零外部依赖，系统 bwrap 不可用时自动回退
3. **完整 Seccomp 过滤**：禁止 `ptrace`、`io_uring`、完整网络 syscall，不仅限于 Unix socket
4. **IP 私有地址检测**：阻止回环、私有地址、CGNAT、链路本地、组播等非公开 IP
5. **Guardian 策略引擎**：AI 行为层面的风险控制（数据泄露、凭证探测、持久化削弱）
6. **Windows WFP 过滤**：按用户 SID 过滤网络流量，支持 TCP/UDP 协议级过滤

### OpenCode 的设计亮点

1. **tree-sitter 命令 AST 解析**：解析 bash/PowerShell AST 提取文件路径参数（虽可绕过但是创新思路）
2. **BashArity 前缀归约**：将命令归约为用户可理解的前缀用于权限记忆
3. **坦诚的安全声明**：明确告知用户"权限系统是 UX 功能，不是安全隔离"

---

## 十、核心结论

```
安全强度排序：Codex > Claude Code >> OpenCode
```

**Codex** 在以下方面领先：
- 三平台全覆盖（Linux/macOS/Windows）
- Seccomp 过滤最严格（全面禁止网络 syscall + ptrace + io_uring）
- 内嵌 bwrap 二进制，零外部依赖
- Guardian 策略引擎提供 AI 行为层面的风险控制

**Claude Code** 在以下方面领先：
- 文件系统防护更细致（防符号链接、大小写绕过、文件移动、裸仓库攻击）
- 不存在路径的创造性防护（`/dev/null` 绑定）
- 多层配置优先级系统（policy > flag > local > user > project）

**OpenCode** 走了完全不同的路线，不做沙箱，专注于用户体验层面的权限管理。官方建议在 Docker 容器或虚拟机中运行以获得安全隔离。
