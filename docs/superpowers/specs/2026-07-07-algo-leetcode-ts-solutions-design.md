# 算法专题 LeetCode TS 题解扩展设计

> **类型**: 设计文档 | **状态**: 已批准 | **最后更新**: 2026-07-07

## 1. 背景与目标

当前 `docs/algo/` 只有少量总览型文档，适合讲概念，但不适合承载持续增长的单题题解。用户这次要补 16 道面试高频题，并明确要求：

- 所有题解放在 `docs/algo/leetcode/` 下
- 采用按题型分层的目录组织，而不是全部平铺
- 每篇题解使用 TypeScript
- 同步更新 `docs/algo/index.md`

本次设计的目标是：

- 在不破坏现有 `docs/algo/` 总览文档结构的前提下，新增一套可持续扩展的单题题解目录
- 让用户可以按题型浏览，也可以从算法专题首页进入题库入口
- 统一 16 篇题解的写法，确保后续继续补题时风格一致

## 2. 目标目录结构

新增目录结构如下：

```text
docs/algo/
├── index.md
├── binary-tree.md
├── design-patterns.md
├── divide-conquer-dp-binary-search.md
├── dp.md
├── graph.md
└── leetcode/
    ├── index.md
    ├── array/
    ├── linked-list/
    ├── tree/
    ├── graph/
    ├── backtracking/
    ├── stack/
    ├── binary-search/
    └── design/
```

说明：

- `docs/algo/index.md` 继续作为算法专题入口页
- `docs/algo/leetcode/index.md` 作为题解总入口，按题型列出所有单题文档
- 各题型目录只承载单题文档，不额外增加多级索引，保持结构轻量

## 3. 题目归类与文件规划

16 道题按如下方式归类：

### 3.1 `array/`

放置数组、矩阵、区间、排序选择类题目：

- `三数之和`
- `字母异位词分组`
- `轮转数组`
- `旋转图像`
- `合并区间`
- `数组中第 k 大元素`

建议文件名：

- `docs/algo/leetcode/array/01-三数之和.md`
- `docs/algo/leetcode/array/02-字母异位词分组.md`
- `docs/algo/leetcode/array/03-轮转数组.md`
- `docs/algo/leetcode/array/04-旋转图像.md`
- `docs/algo/leetcode/array/05-合并区间.md`
- `docs/algo/leetcode/array/06-数组中第k大元素.md`

### 3.2 `linked-list/`

- `反转链表`
- `排序链表`

建议文件名：

- `docs/algo/leetcode/linked-list/01-反转链表.md`
- `docs/algo/leetcode/linked-list/02-排序链表.md`

### 3.3 `tree/`

- `二叉树中序遍历（非递归）`
- `二叉树层序遍历`
- `路径总和`

建议文件名：

- `docs/algo/leetcode/tree/01-二叉树中序遍历.md`
- `docs/algo/leetcode/tree/02-二叉树层序遍历.md`
- `docs/algo/leetcode/tree/03-路径总和.md`

### 3.4 `graph/`

- `岛屿数量`

建议文件名：

- `docs/algo/leetcode/graph/01-岛屿数量.md`

### 3.5 `backtracking/`

- `全排列`
- `有效的括号`

说明：
`有效的括号` 在 LeetCode 常规分类里更偏栈，但本次按用户选定的“按题型分层”执行时，目录数不宜过碎。这里将其与 `全排列` 一起放到 `backtracking/` 并不理想，因此实现时应调整为单独设计 `stack/` 目录，避免错误分类。

修正后的安排：

- `backtracking/`：`全排列`
- `stack/`：`有效的括号`

建议文件名：

- `docs/algo/leetcode/backtracking/01-全排列.md`
- `docs/algo/leetcode/stack/01-有效的括号.md`

### 3.6 `binary-search/`

- `搜索插入位置`

建议文件名：

- `docs/algo/leetcode/binary-search/01-搜索插入位置.md`

### 3.7 `design/`

- `LRU 缓存`

建议文件名：

- `docs/algo/leetcode/design/01-LRU缓存.md`

## 4. 单篇题解模板

每篇题解统一采用以下结构：

```markdown
# <题目名>

> 标签：<题型> | 语言：TypeScript | 面试记录：<原始备注>

## 1. 题目理解
（用 2-4 句话说明输入、输出、目标，不直接复制题面）

## 2. 解题思路
（核心算法、为什么这样做、关键边界）

## 3. TypeScript 实现
（可直接运行的 TS 代码，包含必要类型）

## 4. 复杂度分析
- 时间复杂度
- 空间复杂度

## 5. 易错点
（边界条件、去重、下标、指针移动、递归终止等）

## 6. 面试怎么说
（简洁表达解法、为什么选它、还能怎么优化）
```

补充规则：

- 代码以简洁、面试可手写为主，不追求框架化封装
- 对链表、树题提供必要的 TS 类型定义
- 对需要强调“更优解”的题，思路部分明确指出暴力解法为什么不选
- 面试备注保留用户给出的原始信息，如“小米一面”“字节一面”

## 5. 索引页设计

### 5.1 `docs/algo/index.md`

保留当前总览型链接，并新增一项：

- `LeetCode 题解（TypeScript）`

它指向：

- `docs/algo/leetcode/index.md`

### 5.2 `docs/algo/leetcode/index.md`

按题型分组列出所有题目，形如：

```markdown
# LeetCode 题解（TypeScript）

## 数组
- [三数之和](./array/01-三数之和.md)
- [字母异位词分组](./array/02-字母异位词分组.md)
...

## 链表
- [反转链表](./linked-list/01-反转链表.md)
...
```

该页只承担导航职责，不展开长篇解释。

## 6. 错误处理与边界要求

题解内容需要显式覆盖常见边界：

- 空数组、单元素数组
- 重复元素去重
- 链表为空或只有一个节点
- 树为空
- 回溯题中的 visited 状态恢复
- 图搜索题中的越界与重复访问
- LRU 题中的容量为 1、键重复写入、访问后晋升

文档不需要为每题写测试文件，但需要在题解正文里说明这些边界点。

## 7. 一致性要求

为了避免 16 篇文档像“16 个人写的”，本次实现需要保持以下一致性：

- 标题层级一致
- 复杂度写法一致
- TypeScript 代码风格一致
- 文件命名遵循“序号-题名.md”
- 面试备注统一写在文首信息行中

## 8. 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| 题型划分过细导致目录碎片化 | 只保留当前题目真正需要的题型目录，不预建过多空目录 |
| 部分题分类不准确影响后续维护 | 对 `有效的括号` 单独放入 `stack/`，避免硬塞入回溯目录 |
| 16 篇文档风格不统一 | 先固定模板，再批量编写 |
| 算法描述过长，失去复习价值 | 控制每篇文档聚焦“思路 + 代码 + 面试表达” |
| 首页导航遗漏导致入口不清楚 | 同时更新 `docs/algo/index.md` 与 `docs/algo/leetcode/index.md` |

## 9. 执行顺序

1. 创建 `docs/algo/leetcode/` 及所需题型子目录
2. 创建 `docs/algo/leetcode/index.md`
3. 按统一模板补齐 16 篇题解文档
4. 更新 `docs/algo/index.md`，增加 LeetCode 题解入口
5. 自检目录、相对链接、文件命名和题目归类是否一致

## 10. 完成标准

满足以下条件即视为完成：

- 16 篇题解文档全部存在
- 每篇都包含 TypeScript 实现
- `docs/algo/leetcode/index.md` 可完整导航到 16 道题
- `docs/algo/index.md` 已新增题解入口
- 目录分类与文件命名符合本设计
