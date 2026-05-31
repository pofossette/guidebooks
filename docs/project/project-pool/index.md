# 项目储备

这里用来记录值得持续关注、但材料还没多到需要单独建目录的项目。

## 使用方式

- 先把项目记在这一个页面里，避免一开始就建很多空目录
- 每个项目先写最小必要信息：它是什么、为什么值得看、下一步看什么
- 当某个项目开始出现多篇笔记时，再升级为 `docs/project/<project-name>/` 独立目录

## 目录

- 视觉表达与内容生成
- Agent 治理与插件生态
- 安全与对抗能力
- 补充记录模板

## 视觉表达与内容生成

这一组更偏向 UI 生成、演示表达、前端审美和生成内容质量控制。

### hyperframes

https://github.com/heygen-com/hyperframes

一句话概括：面向智能体的 HTML 转视频项目，让 Agent 通过编写 HTML 来生成和渲染视频内容。

### huashu-design

https://github.com/alchaincyf/huashu-design

一句话概括：一个偏向 Claude Code 的 HTML 原生设计 skill，用来做高保真原型、幻灯片、动画和导出视频。

### presenton

https://github.com/presenton/presenton

一句话概括：一个开源的 AI 演示文稿生成器和 API，可作为 Gamma、Beautiful AI、Decktopus 一类产品的替代方案。

### taste-skill

https://github.com/Leonxlnx/taste-skill

一句话概括：一个给 AI 增加“审美感”的 skill，目标是减少无聊、泛化、模板化的生成结果。

### stop-slop

https://github.com/hardikpandya/stop-slop

一句话概括：一个用于去除 AI 文风痕迹的 skill 文件，目标是让英文 prose 更自然、少”AI 味”。

### skill (emilkowalski)

https://github.com/emilkowalski/skill

一句话概括：Emil Kowalski 将自己多年的设计工程经验浓缩为一个 Claude Code skill，覆盖动效、UI 细节、组件打磨和性能直觉，安装即用。

安装方式：`npx skills add emilkowalski/skill`，支持 Claude Code、Codex、Cursor 等。建议按需开启（如 review 动效时），不建议常驻。

核心内容：

- **动效原则**：UI 动画控制在 300ms 以内；优先用 ease-out 而非 ease-in（ease-in 起步慢会让界面感觉迟钝）；只对 transform 和 opacity 做动画以走 GPU 加速；用 `scale(0.95) + opacity: 0` 代替 `scale(0)`，因为现实世界中事物不会凭空出现
- **组件细节**：按钮要有 `:active` 状态（`scale(0.97)`）让按下有反馈感；禁止对高频操作（hover、scroll）做动画
- **设计品味**：强调 taste 是训练出来的直觉，不是天赋——“the ability to see beyond the obvious and recognize what elevates”

作者背景：Emil Kowalski，Linear 设计工程师（前 Vercel），也是 [animations.dev](https://animations.dev/) 动效课程的作者，同时也是 Sonner（React toast 组件）和 Vaul（React drawer 组件）的作者。

推荐阅读：

- 作者博客 [emilkowal.ski](https://emilkowal.ski/)，收录了大量动效设计文章（Good vs Great Animations、7 Practical Animation Tips、Developing Taste 等）
- [getdesign.md](https://getdesign.md/) — 社区维护的 DESIGN.md 文件集合，用于让 AI 编码代理快速参考 UI 风格规范，可以和这个 skill 配合使用

## Agent 治理与插件生态

这一组更偏向 Agent 基础设施、治理机制和插件扩展体系。

### agent-governance-toolkit

https://github.com/microsoft/agent-governance-toolkit

一句话概括：微软的 AI Agent 治理工具包，重点覆盖策略执行、零信任身份、执行沙箱和可靠性工程。

### claude-plugins-official

https://github.com/anthropics/claude-plugins-official

一句话概括：Anthropic 官方维护的 Claude Code 高质量插件目录，用来集中发布和管理官方认可插件。

## 安全与对抗能力

这一组更偏向安全能力、治理边界和对抗性使用场景。

### Anthropic-Cybersecurity-Skills

https://github.com/mukul975/Anthropic-Cybersecurity-Skills

一句话概括：面向 AI Agent 的结构化网络安全技能库，对齐 MITRE、NIST 等多个安全框架。

### heretic

https://github.com/p-e-w/heretic.git

一句话概括：这是一个主打为语言模型自动移除内容审查限制的项目。

## 补充记录模板

```md
### 项目名

- 链接：
- 分类：
- 我为什么关注：
- 一句话概括：
- 下一步要看：
```
