# 项目专题

这里存放围绕具体项目形成的调研、需求、技术选型、差距分析与实践记录。

## 当前项目

- [archlinux-missionary](archlinux-missionary/index.md)
- [trapmap](trapmap/index.md)

## 项目储备

- [项目储备](project-pool/index.md)

这里先记录值得持续观察、但还没扩展成独立专题的项目。
当某个项目开始积累多篇笔记，再升级为 `docs/project/<project-name>/` 独立目录。

## 结构约束

- 两个项目目录下的 `_repo/` 都是 git submodule，保持原位不移动
- 文档层只补充导航和说明，不把项目源码与调研笔记混成一个平级列表

## 目录约定

每个项目建议保持如下结构：

- `index.md`：项目入口与阅读顺序
- `快速了解.md`：项目概览
- `需求与思考.md`：需求背景、问题定义与下一步判断
- `技术选型.md`：技术路线与依赖选择
- `实践记录/`：落地过程中的问题、实验和复盘
- 其他专题补充文档
- `_repo/`：项目源码 submodule
