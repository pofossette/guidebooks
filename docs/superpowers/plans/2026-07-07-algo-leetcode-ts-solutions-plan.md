# Algo LeetCode TS Solutions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new categorized `docs/algo/leetcode/` topic tree with 16 TypeScript LeetCode solution documents and wire it into the existing algorithm index.

**Architecture:** Keep the existing `docs/algo/` overview pages intact and add a new `leetcode/` subtree for single-problem writeups. Organize the new pages by problem type, keep each page on a fixed template, and use `docs/algo/index.md` plus `docs/algo/leetcode/index.md` as the two navigation entry points.

**Tech Stack:** Markdown, existing docs directory conventions, relative links, TypeScript code snippets.

## Global Constraints

- All new problem writeups live under `docs/algo/leetcode/`.
- Organize problems by category directories rather than a flat list.
- Every problem page must include a TypeScript implementation.
- Update `docs/algo/index.md` to link to the new LeetCode section.
- Keep document structure consistent across all 16 writeups.
- Preserve existing unrelated working tree changes.

---

## File Structure

Create:

- `docs/algo/leetcode/index.md`
  - LeetCode section landing page with grouped links to all 16 problems.
- `docs/algo/leetcode/array/01-三数之和.md`
  - Array two-pointer solution with duplicate handling notes.
- `docs/algo/leetcode/array/02-字母异位词分组.md`
  - Hashing/string normalization solution.
- `docs/algo/leetcode/array/03-轮转数组.md`
  - Reverse-array in-place rotation solution.
- `docs/algo/leetcode/array/04-旋转图像.md`
  - Transpose + reverse rows matrix rotation solution.
- `docs/algo/leetcode/array/05-合并区间.md`
  - Interval sort-and-merge solution.
- `docs/algo/leetcode/array/06-数组中第k大元素.md`
  - Heap or quickselect-oriented solution, with chosen approach explained.
- `docs/algo/leetcode/linked-list/01-反转链表.md`
  - Iterative pointer-reversal solution.
- `docs/algo/leetcode/linked-list/02-排序链表.md`
  - Linked-list merge sort solution.
- `docs/algo/leetcode/tree/01-二叉树中序遍历.md`
  - Non-recursive stack traversal solution.
- `docs/algo/leetcode/tree/02-二叉树层序遍历.md`
  - BFS queue traversal solution.
- `docs/algo/leetcode/tree/03-路径总和.md`
  - DFS path sum existence solution.
- `docs/algo/leetcode/backtracking/01-全排列.md`
  - DFS + visited or swapping permutation solution.
- `docs/algo/leetcode/stack/01-有效的括号.md`
  - Stack-based bracket validation solution.
- `docs/algo/leetcode/graph/01-岛屿数量.md`
  - DFS grid flood-fill solution.
- `docs/algo/leetcode/binary-search/01-搜索插入位置.md`
  - Boundary binary search solution.
- `docs/algo/leetcode/design/01-LRU缓存.md`
  - Hash map + doubly linked list design solution.

Modify:

- `docs/algo/index.md`
  - Add one link entry for the new LeetCode section.

## Task 1: Create Section Skeleton and Navigation

**Files:**

- Create: `docs/algo/leetcode/index.md`
- Modify: `docs/algo/index.md`

**Interfaces:**

- Consumes: Existing `docs/algo/index.md` lightweight list format.
- Produces: New section entry point `docs/algo/leetcode/index.md` and homepage link from `docs/algo/index.md`.

- [ ] **Step 1: Write the new LeetCode section landing page**

Create `docs/algo/leetcode/index.md` with this content:

```markdown
# LeetCode 题解（TypeScript）

这一组文档按题型整理常见面试题，重点保留思路、TypeScript 写法、复杂度和面试表达。

## 数组

- [三数之和](./array/01-三数之和.md)
- [字母异位词分组](./array/02-字母异位词分组.md)
- [轮转数组](./array/03-轮转数组.md)
- [旋转图像](./array/04-旋转图像.md)
- [合并区间](./array/05-合并区间.md)
- [数组中第 k 大元素](./array/06-数组中第k大元素.md)

## 链表

- [反转链表](./linked-list/01-反转链表.md)
- [排序链表](./linked-list/02-排序链表.md)

## 二叉树

- [二叉树中序遍历](./tree/01-二叉树中序遍历.md)
- [二叉树层序遍历](./tree/02-二叉树层序遍历.md)
- [路径总和](./tree/03-路径总和.md)

## 回溯

- [全排列](./backtracking/01-全排列.md)

## 栈

- [有效的括号](./stack/01-有效的括号.md)

## 图

- [岛屿数量](./graph/01-岛屿数量.md)

## 二分

- [搜索插入位置](./binary-search/01-搜索插入位置.md)

## 设计题

- [LRU 缓存](./design/01-LRU缓存.md)
```

- [ ] **Step 2: Add the new link to the algorithm homepage**

In `docs/algo/index.md`, insert this bullet before the closing paragraph:

```markdown
- [LeetCode 题解（TypeScript）](leetcode/index.md)
```

Expected final structure in `docs/algo/index.md`:

```markdown
# 算法笔记

当前算法目录规模不大，适合继续保持轻量结构：

- [二叉树](binary-tree.md)
- [图](graph.md)
- [分治、DP、二分搜索](divide-conquer-dp-binary-search.md)
- [LeetCode 72：编辑距离](dp.md)
- [设计模式：发布订阅 / 观察者 / 工厂](design-patterns.md)
- [LeetCode 题解（TypeScript）](leetcode/index.md)

如果后续内容继续增长，建议按题型拆分为 `tree/`、`graph/`、`dp/` 等子目录。
```

- [ ] **Step 3: Verify the two navigation files**

Run:

```bash
rtk sed -n '1,220p' docs/algo/index.md
rtk sed -n '1,240p' docs/algo/leetcode/index.md
```

Expected: both files render the new LeetCode entry and all 16 links are grouped by category.

- [ ] **Step 4: Commit the navigation skeleton**

Run:

```bash
git add docs/algo/index.md docs/algo/leetcode/index.md
git commit -m "docs: add leetcode algo section navigation"
```

## Task 2: Add Array Problem Writeups

**Files:**

- Create: `docs/algo/leetcode/array/01-三数之和.md`
- Create: `docs/algo/leetcode/array/02-字母异位词分组.md`
- Create: `docs/algo/leetcode/array/03-轮转数组.md`
- Create: `docs/algo/leetcode/array/04-旋转图像.md`
- Create: `docs/algo/leetcode/array/05-合并区间.md`
- Create: `docs/algo/leetcode/array/06-数组中第k大元素.md`

**Interfaces:**

- Consumes: The fixed problem-page template from the approved spec.
- Produces: Six array-category pages linked from `docs/algo/leetcode/index.md`.

- [ ] **Step 1: Create `01-三数之和.md`**

Use this structure:

```markdown
# 三数之和

> 标签：数组、双指针、排序 | 语言：TypeScript | 面试记录：1次，小米一面

## 1. 题目理解

给定一个整数数组，找出所有和为 0 且不重复的三元组。重点不是暴力枚举，而是处理好去重。

## 2. 解题思路

先排序，固定第一个数，然后把剩余区间转成双指针两数之和。遇到重复元素时跳过，保证结果不重复。

## 3. TypeScript 实现

```typescript
function threeSum(nums: number[]): number[][] {
  const result: number[][] = [];
  nums.sort((a, b) => a - b);

  for (let i = 0; i < nums.length - 2; i++) {
    if (i > 0 && nums[i] === nums[i - 1]) continue;
    if (nums[i] > 0) break;

    let left = i + 1;
    let right = nums.length - 1;

    while (left < right) {
      const sum = nums[i] + nums[left] + nums[right];

      if (sum === 0) {
        result.push([nums[i], nums[left], nums[right]]);
        left++;
        right--;

        while (left < right && nums[left] === nums[left - 1]) left++;
        while (left < right && nums[right] === nums[right + 1]) right--;
      } else if (sum < 0) {
        left++;
      } else {
        right--;
      }
    }
  }

  return result;
}
```

## 4. 复杂度分析

- 时间复杂度：`O(n^2)`
- 空间复杂度：`O(1)`，不计返回结果

## 5. 易错点

- 固定点和双指针都要去重
- 排序后如果当前固定值已经大于 0，可以提前结束
- 结果不能包含重复三元组

## 6. 面试怎么说

先排序，把问题转成固定一个数加双指针找两数之和。核心是三层去重：固定点去重、找到答案后左指针去重、右指针去重。
```

- [ ] **Step 2: Create `02-字母异位词分组.md`**

Include:

- key idea: sort each string and use the sorted string as a hash key
- TypeScript function signature: `function groupAnagrams(strs: string[]): string[][]`
- complexity section: `O(n * k log k)` where `k` is average string length
- interview note: `1次，xhs一面`

- [ ] **Step 3: Create `03-轮转数组.md`**

Include:

- reverse-array approach instead of extra array as the main solution
- helper signature: `function reverse(nums: number[], left: number, right: number): void`
- main signature: `function rotate(nums: number[], k: number): void`
- edge case: `k %= nums.length`

- [ ] **Step 4: Create `04-旋转图像.md`**

Include:

- square matrix in-place rotation
- main approach: transpose first, then reverse every row
- main signature: `function rotate(matrix: number[][]): void`
- explain why this is `O(1)` extra space

- [ ] **Step 5: Create `05-合并区间.md`**

Include:

- sort by start boundary
- use one current interval and append when disjoint
- signature: `function merge(intervals: number[][]): number[][]`
- edge cases: empty array, fully nested intervals

- [ ] **Step 6: Create `06-数组中第k大元素.md`**

Include:

- choose quickselect as the main solution
- signature: `function findKthLargest(nums: number[], k: number): number`
- explain target index as `nums.length - k`
- mention heap solution as an alternative in the interview section
- interview note: `1次，腾讯一面`

- [ ] **Step 7: Verify all array pages exist and have the required sections**

Run:

```bash
rtk rg -n "^## 1\\. 题目理解|^## 2\\. 解题思路|^## 3\\. TypeScript 实现|^## 4\\. 复杂度分析|^## 5\\. 易错点|^## 6\\. 面试怎么说" docs/algo/leetcode/array
```

Expected: each of the six files shows all six section headers.

- [ ] **Step 8: Commit the array batch**

Run:

```bash
git add docs/algo/leetcode/array
git commit -m "docs: add array leetcode solutions"
```

## Task 3: Add Linked List and Tree Writeups

**Files:**

- Create: `docs/algo/leetcode/linked-list/01-反转链表.md`
- Create: `docs/algo/leetcode/linked-list/02-排序链表.md`
- Create: `docs/algo/leetcode/tree/01-二叉树中序遍历.md`
- Create: `docs/algo/leetcode/tree/02-二叉树层序遍历.md`
- Create: `docs/algo/leetcode/tree/03-路径总和.md`

**Interfaces:**

- Consumes: Shared problem-page template and local TS node type definitions.
- Produces: Five pages covering linked-list and tree interview staples.

- [ ] **Step 1: Create `01-反转链表.md`**

Include:

- Type definition:

```typescript
class ListNode {
  val: number;
  next: ListNode | null;

  constructor(val = 0, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}
```

- iterative solution signature: `function reverseList(head: ListNode | null): ListNode | null`
- key variables: `prev`, `curr`, `next`

- [ ] **Step 2: Create `02-排序链表.md`**

Include:

- interview note: `2次，快手，美团一面`
- approach: merge sort on linked list
- helper signatures:
  - `function sortList(head: ListNode | null): ListNode | null`
  - `function merge(left: ListNode | null, right: ListNode | null): ListNode | null`
- explain slow-fast pointer split

- [ ] **Step 3: Create `01-二叉树中序遍历.md`**

Include:

- interview note: `1次，百度一面`
- non-recursive traversal only as the main solution
- type definition:

```typescript
class TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;

  constructor(val = 0, left: TreeNode | null = null, right: TreeNode | null = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}
```

- signature: `function inorderTraversal(root: TreeNode | null): number[]`

- [ ] **Step 4: Create `02-二叉树层序遍历.md`**

Include:

- interview note: `1次，字节一面`
- BFS by queue and per-level size
- signature: `function levelOrder(root: TreeNode | null): number[][]`

- [ ] **Step 5: Create `03-路径总和.md`**

Include:

- DFS recursion solution
- signature: `function hasPathSum(root: TreeNode | null, targetSum: number): boolean`
- edge case: leaf node must exactly match the remaining sum

- [ ] **Step 6: Verify linked-list and tree pages**

Run:

```bash
rtk find docs/algo/leetcode/linked-list docs/algo/leetcode/tree -maxdepth 1 -type f | sort
```

Expected: five new markdown files are present under the expected directories.

- [ ] **Step 7: Commit the linked-list and tree batch**

Run:

```bash
git add docs/algo/leetcode/linked-list docs/algo/leetcode/tree
git commit -m "docs: add linked list and tree leetcode solutions"
```

## Task 4: Add Backtracking, Stack, Graph, Binary Search, and Design Writeups

**Files:**

- Create: `docs/algo/leetcode/backtracking/01-全排列.md`
- Create: `docs/algo/leetcode/stack/01-有效的括号.md`
- Create: `docs/algo/leetcode/graph/01-岛屿数量.md`
- Create: `docs/algo/leetcode/binary-search/01-搜索插入位置.md`
- Create: `docs/algo/leetcode/design/01-LRU缓存.md`

**Interfaces:**

- Consumes: Shared page template and category links already present in `docs/algo/leetcode/index.md`.
- Produces: Remaining five pages that complete the 16-problem set.

- [ ] **Step 1: Create `01-全排列.md`**

Include:

- DFS + `used` array solution
- signature: `function permute(nums: number[]): number[][]`
- explain push/pop backtracking and state restoration

- [ ] **Step 2: Create `01-有效的括号.md`**

Include:

- interview note: `1次，腾讯一面`
- stack solution with map from closing bracket to opening bracket
- signature: `function isValid(s: string): boolean`
- edge case: odd string length can fail early

- [ ] **Step 3: Create `01-岛屿数量.md`**

Include:

- interview note: `1次，百度二面`
- DFS flood-fill over grid
- signature: `function numIslands(grid: string[][]): number`
- explain visited marking by mutating `'1'` to `'0'`

- [ ] **Step 4: Create `01-搜索插入位置.md`**

Include:

- binary search for first position `>= target`
- signature: `function searchInsert(nums: number[], target: number): number`
- mention why returned `left` is the insertion point

- [ ] **Step 5: Create `01-LRU缓存.md`**

Include:

- interview note: `4次，京东一面，百度二面，字节二面2`
- custom doubly linked list + `Map<number, Node>`
- public API:
  - `class LRUCache`
  - `get(key: number): number`
  - `put(key: number, value: number): void`
- explain why both operations are `O(1)`
- include `Node` class in the code snippet

- [ ] **Step 6: Verify the remaining category pages**

Run:

```bash
rtk find docs/algo/leetcode/backtracking docs/algo/leetcode/stack docs/algo/leetcode/graph docs/algo/leetcode/binary-search docs/algo/leetcode/design -maxdepth 1 -type f | sort
```

Expected: five new markdown files are present, one in each category directory.

- [ ] **Step 7: Commit the remaining problem batch**

Run:

```bash
git add docs/algo/leetcode/backtracking docs/algo/leetcode/stack docs/algo/leetcode/graph docs/algo/leetcode/binary-search docs/algo/leetcode/design
git commit -m "docs: add remaining leetcode solutions"
```

## Task 5: Final Review and Link Validation

**Files:**

- Verify: `docs/algo/index.md`
- Verify: `docs/algo/leetcode/index.md`
- Verify: `docs/algo/leetcode/**/*.md`

**Interfaces:**

- Consumes: All files created in Tasks 1-4.
- Produces: A validated documentation set ready to merge.

- [ ] **Step 1: Check that all 16 problem files exist**

Run:

```bash
rtk find docs/algo/leetcode -type f | sort
```

Expected: `index.md` plus exactly 16 problem pages across the category directories.

- [ ] **Step 2: Check for the required TypeScript section in every problem page**

Run:

```bash
rtk rg -l "^## 3\\. TypeScript 实现$" docs/algo/leetcode | sort
```

Expected: all 16 problem pages appear in the output.

- [ ] **Step 3: Spot-check interview notes and category coverage**

Run:

```bash
rtk rg -n "面试记录" docs/algo/leetcode
```

Expected: pages with provided interview notes include the original source remarks, and pages without interview frequency still keep the same metadata line format.

- [ ] **Step 4: Review the navigation and one page from each complex category**

Run:

```bash
rtk sed -n '1,220p' docs/algo/leetcode/index.md
rtk sed -n '1,220p' docs/algo/leetcode/array/01-三数之和.md
rtk sed -n '1,220p' docs/algo/leetcode/linked-list/02-排序链表.md
rtk sed -n '1,240p' docs/algo/leetcode/design/01-LRU缓存.md
```

Expected: the landing page links match the created files, and the sampled pages all use the same six-section template.

- [ ] **Step 5: Commit the final review state**

Run:

```bash
git add docs/algo
git commit -m "docs: finalize leetcode ts solution set"
```

## Self-Review

### Spec coverage

- `docs/algo/leetcode/` subtree: covered by Tasks 1-4.
- categorized directories instead of flat layout: covered by Tasks 1-4.
- 16 TypeScript writeups: covered by Tasks 2-4.
- `docs/algo/index.md` update: covered by Task 1.
- consistency across pages: enforced in Tasks 2-4 and checked in Task 5.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to Task N” placeholders remain.
- Every file path referenced in the plan is concrete.
- Every validation command has an expected result.

### Type consistency

- Problem-page required section names are identical across tasks.
- Navigation paths in Task 1 match the file paths produced in Tasks 2-4.
- Named TypeScript signatures referenced in later checks are defined in their task instructions.
