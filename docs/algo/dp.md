# LeetCode 72：编辑距离（Edit Distance）

> 给定两个单词 `word1` 和 `word2`，计算将 `word1` 转换成 `word2` 所使用的最少操作数。
> 允许的操作：插入一个字符、删除一个字符、替换一个字符。

这道题是二维动态规划的经典代表，也是理解"两个序列之间关系"的最佳入门题之一。

## 1. 先从直觉理解问题

假设要把 `horse` 转成 `ros`，最少需要几步？

可以这样想：

- 把 `horse` 的 `h` 替换成 `r` → `rorse`
- 删掉 `rorse` 的第二个 `r` → `rose`
- 删掉 `rose` 的 `e` → `ros`

共 3 步。但这真的是最优的吗？靠人脑穷举很难保证，所以需要一种系统化的思考方式。

## 2. 核心思路：从最后一个字符往前想

动态规划的关键是"缩小问题规模"。这里我们把目光放在两个字符串的**末尾**：

对于 `word1[0..i]` 和 `word2[0..j]`，最后一步只有三种可能：

| 操作 | 含义 | 代价来源 |
| --- | --- | --- |
| 替换 | 把 `word1[i]` 改成 `word2[j]`，然后看 `word1[0..i-1]` 和 `word2[0..j-1]` | `dp[i-1][j-1] + (word1[i] === word2[j] ? 0 : 1)` |
| 删除 | 删掉 `word1[i]`，然后看 `word1[0..i-1]` 和 `word2[0..j]` | `dp[i-1][j] + 1` |
| 插入 | 在 `word1` 末尾插入 `word2[j]`，然后看 `word1[0..i]` 和 `word2[0..j-1]` | `dp[i][j-1] + 1` |

为什么插入可以这样理解？在 `word1` 末尾插入一个字符等于 `word2[j]`，插入后这个字符就匹配了，剩下的问题就是 `word1[0..i]` 和 `word2[0..j-1]` 的编辑距离。

三种操作取最小值，就是答案。

### 一个容易混淆的点：为什么没有"删除 word2"的操作？

因为对称性。"从 word1 删除一个字符"等价于"往 word2 插入一个字符"。我们只需要在一边做插入/删除，另一边自然就对应了。所以三种操作已经覆盖了所有情况。

## 3. 状态定义和转移方程

定义 `dp[i][j]` = 将 `word1` 的前 `i` 个字符转换成 `word2` 的前 `j` 个字符所需的最少操作数。

转移方程：

```
dp[i][j] = min(
  dp[i-1][j-1] + (word1[i-1] === word2[j-1] ? 0 : 1),  // 替换（或不操作）
  dp[i-1][j] + 1,                                         // 删除
  dp[i][j-1] + 1                                          // 插入
)
```

注意数组下标：`dp[i]` 对应字符串的第 `i` 个字符（即 `word1[i-1]`），因为 `dp[0]` 留给了空字符串。

## 4. 初始值：空字符串是起点

当一个字符串为空时，编辑距离就是另一个字符串的长度（全插入或全删除）：

```
dp[i][0] = i    // word1 前 i 个字符 → 空字符串，删 i 次
dp[0][j] = j    // 空字符串 → word2 前 j 个字符，插 j 次
```

这是整个 DP 的基础，没有这些初始值，转移就无法启动。

## 5. 完整示例：horse → ros

用 `dp[i][j]` 填表，`word1 = "horse"`, `word2 = "ros"`：

```
        ""  r   o   s
    ""   0   1   2   3
    h    1   1   2   3
    o    2   2   1   2
    r    3   2   2   2
    s    4   3   3   2
    e    5   4   4   3
```

最终答案 `dp[5][3] = 3`。

逐格推导几个关键位置：

- `dp[1][1]`（h→r）：`h != r`，取 `min(dp[0][0]+1, dp[0][1]+1, dp[1][0]+1) = min(1, 2, 2) = 1`（替换）
- `dp[2][2]`（ho→ro）：`o == o`，取 `dp[1][1] + 0 = 1`（不用操作最后一个字符）
- `dp[5][3]`（horse→ros）：`e != s`，取 `min(dp[4][2]+1, dp[4][3]+1, dp[5][2]+1) = min(3, 3, 4) = 3`

## 6. 代码实现

### 二维 DP（最直观）

```typescript
function minDistance(word1: string, word2: string): number {
  const m = word1.length;
  const n = word2.length;

  // dp[i][j] = word1 前 i 个字符 → word2 前 j 个字符的编辑距离
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  // 初始值：空字符串 ↔ 非空字符串
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // 填表
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (word1[i - 1] === word2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]; // 字符相同，不需要操作
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // 替换
          dp[i - 1][j] + 1,     // 删除
          dp[i][j - 1] + 1      // 插入
        );
      }
    }
  }

  return dp[m][n];
}
```

### 空间优化：滚动数组

观察转移方程，`dp[i][j]` 只依赖 `dp[i-1][...]` 和 `dp[i][...]`，即当前行和上一行。所以可以用两个一维数组交替使用：

```typescript
function minDistance(word1: string, word2: string): number {
  const m = word1.length;
  const n = word2.length;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1).fill(0);
    curr[0] = i; // 初始值：前 i 个字符 → 空字符串

    for (let j = 1; j <= n; j++) {
      if (word1[i - 1] === word2[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
      }
    }

    prev = curr;
  }

  return prev[n];
}
```

空间复杂度从 `O(m × n)` 降到 `O(n)`。

### 进一步优化为单数组

如果仔细处理 `prev[j - 1]` 的值（它在被覆盖前就是"左上角"的值），可以只用一个数组：

```typescript
function minDistance(word1: string, word2: string): number {
  const m = word1.length;
  const n = word2.length;

  const dp = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; // 保存左上角的值
    dp[0] = i;

    for (let j = 1; j <= n; j++) {
      const temp = dp[j]; // 暂存，下一轮它就是"左上角"

      if (word1[i - 1] === word2[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = Math.min(prev, dp[j], dp[j - 1]) + 1;
      }

      prev = temp;
    }
  }

  return dp[n];
}
```

## 7. 复杂度分析

| 版本 | 时间复杂度 | 空间复杂度 |
| --- | --- | --- |
| 二维 DP | O(m × n) | O(m × n) |
| 滚动数组 | O(m × n) | O(n) |
| 单数组 | O(m × n) | O(n) |

## 8. 常见误区

**一上来就写代码，没有先想清楚状态定义。** `dp[i][j]` 到底代表"前 i 个"还是"第 i 个"，直接影响下标处理和初始值。建议先在纸上写清楚定义再动手。

**初始值填错。** `dp[i][0] = i` 和 `dp[0][j] = j` 是由问题定义决定的——把 i 个字符变成 0 个字符，必须删 i 次。漏填或填错会导致后续转移全部出错。

**搞混插入和删除的方向。** `dp[i-1][j] + 1` 是删除 `word1` 的字符，`dp[i][j-1] + 1` 是往 `word1` 插入字符（等价于删除 `word2` 的字符）。两者方向不同，不能互换。

**字符相同时忘了跳过。** 当 `word1[i-1] === word2[j-1]` 时，`dp[i][j] = dp[i-1][j-1]`，不需要任何操作。如果仍然算 `min + 1`，结果会偏大。

## 9. 举一反三

编辑距离的 DP 思路可以推广到很多类似问题：

- **最长公共子序列（LCS）**：`dp[i][j]` 的转移逻辑类似，只是操作变成了"匹配"和"跳过"。
- **两个字符串的最小 ASCII 删除和**：在编辑距离基础上加上字符的 ASCII 值作为代价。
- **不同的子序列**：计算一个字符串中有多少种子序列等于另一个字符串，同样是二维 DP。
- **回文距离 / 使字符串变为回文的最少操作**：本质是求字符串与其反转的编辑距离。

这类题的共同特征是：**有两个序列，需要对齐或匹配**。一旦识别出这个模式，就可以用类似的二维 DP 框架去套。

## 10. 一页速记

- **状态**：`dp[i][j]` = `word1` 前 i 个字符 → `word2` 前 j 个字符的最少操作数。
- **转移**：字符相同 → `dp[i-1][j-1]`；不同 → `min(替换, 删除, 插入) + 1`。
- **初始值**：`dp[i][0] = i`，`dp[0][j] = j`。
- **口诀**：末尾相同直接跳，不同三选一取最小。
