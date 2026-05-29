# 项目专题

这里存放围绕具体项目形成的调研、需求和选型文档。

## 当前项目

- [archlinux-missionary](archlinux-missionary/index.md)
- [trapmap](trapmap/index.md)

## 结构约束

- 两个项目目录下的 `_repo/` 都是 git submodule，保持原位不移动
- 文档层只补充导航和说明，不把项目源码与分析文档混放

## 目录约定

每个项目建议保持如下结构：

- `index.md`：项目入口与阅读顺序
- `快速了解.md`：项目概览
- `需求和思考.md`：需求背景与问题定义
- `选型.md`：技术选型
- 其他专题补充文档
- `_repo/`：项目源码 submodule
