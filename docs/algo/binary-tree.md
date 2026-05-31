下面用 TypeScript 来系统介绍二叉树的几种核心遍历方式，并提供**递归**、**迭代**两种实现，以及**层序遍历**和空间优化的 **Morris 遍历**。所有代码都带完整类型，可直接运行。

---

## 1. 二叉树节点定义

首先用泛型定义树节点，`left`、`right` 可为 `null`：

```typescript
class TreeNode<T> {
  val: T;
  left: TreeNode<T> | null;
  right: TreeNode<T> | null;

  constructor(val: T, left?: TreeNode<T> | null, right?: TreeNode<T> | null) {
    this.val = val;
    this.left = left ?? null;
    this.right = right ?? null;
  }
}
```

---

## 2. 递归遍历（前序、中序、后序）

递归实现最直观，时间复杂度 O(n)，空间复杂度 O(n)（递归栈）。

```typescript
// 前序遍历：根 -> 左 -> 右
function preorderRecursive<T>(root: TreeNode<T> | null): T[] {
  const result: T[] = [];
  function dfs(node: TreeNode<T> | null) {
    if (!node) return;
    result.push(node.val);      // 访问根
    dfs(node.left);             // 遍历左子树
    dfs(node.right);            // 遍历右子树
  }
  dfs(root);
  return result;
}

// 中序遍历：左 -> 根 -> 右
function inorderRecursive<T>(root: TreeNode<T> | null): T[] {
  const result: T[] = [];
  function dfs(node: TreeNode<T> | null) {
    if (!node) return;
    dfs(node.left);
    result.push(node.val);
    dfs(node.right);
  }
  dfs(root);
  return result;
}

// 后序遍历：左 -> 右 -> 根
function postorderRecursive<T>(root: TreeNode<T> | null): T[] {
  const result: T[] = [];
  function dfs(node: TreeNode<T> | null) {
    if (!node) return;
    dfs(node.left);
    dfs(node.right);
    result.push(node.val);
  }
  dfs(root);
  return result;
}
```

---

## 3. 迭代遍历（栈模拟递归）

### 3.1 前序遍历（栈）

前序的迭代很直接：**访问当前节点，先压入右子节点，再压入左子节点**（栈后进先出，保证左子先被处理）。

```typescript
function preorderIterative<T>(root: TreeNode<T> | null): T[] {
  const result: T[] = [];
  if (!root) return result;

  const stack: TreeNode<T>[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;   // 弹出栈顶
    result.push(node.val);
    // 先压右，后压左，这样左会先出栈
    if (node.right) stack.push(node.right);
    if (node.left) stack.push(node.left);
  }
  return result;
}
```

### 3.2 中序遍历（栈）

中序需要**一直向左走到头**，沿途节点入栈，弹出的节点访问后再转向右子树。

```typescript
function inorderIterative<T>(root: TreeNode<T> | null): T[] {
  const result: T[] = [];
  const stack: TreeNode<T>[] = [];
  let curr: TreeNode<T> | null = root;

  while (curr || stack.length > 0) {
    // 先把所有左子节点入栈
    while (curr) {
      stack.push(curr);
      curr = curr.left;
    }
    // 弹出并访问
    curr = stack.pop()!;
    result.push(curr.val);
    // 转向右子树
    curr = curr.right;
  }
  return result;
}
```

### 3.3 后序遍历（栈）

后序迭代稍复杂，这里用**双栈法**，逻辑清晰：第一个栈模拟“根-右-左”顺序，第二个栈反转得到“左-右-根”。

```typescript
function postorderIterative<T>(root: TreeNode<T> | null): T[] {
  const result: T[] = [];
  if (!root) return result;

  const stack1: TreeNode<T>[] = [root];
  const stack2: TreeNode<T>[] = [];

  while (stack1.length > 0) {
    const node = stack1.pop()!;
    stack2.push(node);
    // 注意：这里先压左后压右，因为 stack2 会再次反转
    if (node.left) stack1.push(node.left);
    if (node.right) stack1.push(node.right);
  }

  while (stack2.length > 0) {
    result.push(stack2.pop()!.val);
  }
  return result;
}
```

---

## 4. 层序遍历（广度优先 BFS）

使用**队列**按层逐层访问，返回一维数组（也可改成二维按层输出）。

```typescript
function levelOrder<T>(root: TreeNode<T> | null): T[] {
  const result: T[] = [];
  if (!root) return result;

  const queue: TreeNode<T>[] = [root];
  while (queue.length > 0) {
    const node = queue.shift()!; // 出队
    result.push(node.val);
    if (node.left) queue.push(node.left);
    if (node.right) queue.push(node.right);
  }
  return result;
}
```

---

## 5. 进阶：Morris 遍历（中序，O(1) 空间）

Morris 遍历利用叶子节点的空闲右指针建立临时线索，**空间复杂度 O(1)**，不借助栈。这里给出中序版本（会临时修改结构，结束后恢复）。

```typescript
function morrisInorder<T>(root: TreeNode<T> | null): T[] {
  const result: T[] = [];
  let curr: TreeNode<T> | null = root;

  while (curr) {
    if (!curr.left) {
      // 无左子树，直接访问并向右
      result.push(curr.val);
      curr = curr.right;
    } else {
      // 找到前驱节点（左子树的最右节点）
      let pre = curr.left;
      while (pre.right && pre.right !== curr) {
        pre = pre.right;
      }
      if (!pre.right) {
        // 建立线索，连接前驱的右指针到当前节点
        pre.right = curr;
        curr = curr.left;
      } else {
        // 线索已存在，说明左子树已遍历完，断开线索并访问
        pre.right = null;
        result.push(curr.val);
        curr = curr.right;
      }
    }
  }
  return result;
}
```

---

## 6. 完整示例运行

用下面这棵树测试：

```
        1
       / \
      2   3
     / \   \
    4   5   6
```

```typescript
const root = new TreeNode(1,
  new TreeNode(2,
    new TreeNode(4),
    new TreeNode(5)
  ),
  new TreeNode(3,
    null,
    new TreeNode(6)
  )
);

console.log('前序(递归):', preorderRecursive(root));   // [1,2,4,5,3,6]
console.log('前序(迭代):', preorderIterative(root));
console.log('中序(递归):', inorderRecursive(root));    // [4,2,5,1,3,6]
console.log('中序(迭代):', inorderIterative(root));
console.log('中序(Morris):', morrisInorder(root));
console.log('后序(递归):', postorderRecursive(root));  // [4,5,2,6,3,1]
console.log('后序(迭代):', postorderIterative(root));
console.log('层序遍历:', levelOrder(root));            // [1,2,3,4,5,6]
```

**输出结果：**

```
前序(递归): [ 1, 2, 4, 5, 3, 6 ]
前序(迭代): [ 1, 2, 4, 5, 3, 6 ]
中序(递归): [ 4, 2, 5, 1, 3, 6 ]
中序(迭代): [ 4, 2, 5, 1, 3, 6 ]
中序(Morris): [ 4, 2, 5, 1, 3, 6 ]
后序(递归): [ 4, 5, 2, 6, 3, 1 ]
后序(迭代): [ 4, 5, 2, 6, 3, 1 ]
层序遍历: [ 1, 2, 3, 4, 5, 6 ]
```

---

## 7. 应用场景总结

- **前序**：常用于序列化/反序列化二叉树、克隆树结构。
- **中序**：在二叉搜索树（BST）中得到有序序列。
- **后序**：适合删除树（先删子节点再删父节点）、计算表达树的值。
- **层序**：适合按层处理问题（如求树的宽度、逐层打印）。
- **Morris**：当内存严格受限时，用 O(1) 额外空间完成中序（同理也有前序）（会临时修改树）。

以上代码均使用 TypeScript 完整标注了类型，可直接编译执行。你可以根据实际需求选用递归（简洁）或迭代（避免栈溢出），在空间受限场景下考虑 Morris 遍历。
