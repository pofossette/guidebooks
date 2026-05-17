图的遍历是指从图中的某一顶点出发，沿着边访问图中其余顶点，且使每个顶点被访问一次的过程。它是很多图算法的基础。下面以 TypeScript 配合邻接表来介绍两种核心遍历方式及一种重要扩展。

---

### 图的表示（邻接表）

先用 `Map` 定义图的类型，键为顶点，值为该顶点的邻居数组。

```typescript
type Graph<T> = Map<T, T[]>;

// 示例（无向图）
const graph: Graph<string> = new Map([
  ["A", ["B", "C"]],
  ["B", ["A", "D", "E"]],
  ["C", ["A", "F"]],
  ["D", ["B"]],
  ["E", ["B", "F"]],
  ["F", ["C", "E"]],
]);
```

---

### 1. 深度优先搜索（Depth First Search, DFS）

DFS 尽可能“深”地搜索图的分支，直到该分支的末端再回溯。

#### 递归实现（调用栈隐式维护）

```typescript
function dfsRecursive<T>(
  graph: Graph<T>,
  start: T,
  visited: Set<T> = new Set()
): T[] {
  const result: T[] = [];
  visited.add(start);
  result.push(start);

  for (const neighbor of graph.get(start) ?? []) {
    if (!visited.has(neighbor)) {
      result.push(...dfsRecursive(graph, neighbor, visited));
    }
  }
  return result;
}
```

#### 迭代实现（显式栈）

```typescript
function dfsIterative<T>(graph: Graph<T>, start: T): T[] {
  const visited = new Set<T>();
  const stack: T[] = [start];
  const result: T[] = [];

  while (stack.length > 0) {
    const vertex = stack.pop()!;
    if (!visited.has(vertex)) {
      visited.add(vertex);
      result.push(vertex);
      // 邻居逆序入栈可保证遍历顺序与递归一致（可选）
      const neighbors = graph.get(vertex) ?? [];
      for (let i = neighbors.length - 1; i >= 0; i--) {
        if (!visited.has(neighbors[i])) {
          stack.push(neighbors[i]);
        }
      }
    }
  }
  return result;
}
```

---

### 2. 广度优先搜索（Breadth First Search, BFS）

BFS 按距离层层推进，先访问离起点近的节点。常用于无权图的最短路径问题。

```typescript
function bfs<T>(graph: Graph<T>, start: T): T[] {
  const visited = new Set<T>();
  const queue: T[] = [start];
  visited.add(start);
  const result: T[] = [];

  while (queue.length > 0) {
    const vertex = queue.shift()!;
    result.push(vertex);
    for (const neighbor of graph.get(vertex) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return result;
}
```

> 💡 若需记录每个节点的层级或前驱节点，可以把 `queue` 改为存储 `[vertex, depth]` 或配合 `Map` 记录距离。

---

### 3. 拓扑排序（有向无环图的“遍历”）

拓扑排序是一种特殊的线性遍历，要求对每条边 `u → v`，`u` 在序列中出现在 `v` 之前。常用于任务调度、依赖解析。

#### 基于 DFS 的拓扑排序（后序逆序）

```typescript
function topologicalSortDFS<T>(graph: Graph<T>): T[] {
  const visited = new Set<T>();
  const stack: T[] = [];

  function dfs(vertex: T): void {
    visited.add(vertex);
    for (const neighbor of graph.get(vertex) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    }
    // 所有后继访问完再入栈
    stack.push(vertex);
  }

  for (const vertex of graph.keys()) {
    if (!visited.has(vertex)) {
      dfs(vertex);
    }
  }
  return stack.reverse(); // 逆后序即为拓扑序
}
```

#### 基于 BFS 的 Kahn 算法（入度表）

```typescript
function topologicalSortKahn<T>(graph: Graph<T>): T[] {
  // 计算入度
  const inDegree = new Map<T, number>();
  for (const [vertex, neighbors] of graph) {
    if (!inDegree.has(vertex)) inDegree.set(vertex, 0);
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
    }
  }

  // 入度为 0 的顶点入队
  const queue: T[] = [];
  for (const [vertex, degree] of inDegree) {
    if (degree === 0) queue.push(vertex);
  }

  const result: T[] = [];
  while (queue.length > 0) {
    const vertex = queue.shift()!;
    result.push(vertex);
    for (const neighbor of graph.get(vertex) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // 结果长度不等于顶点数则存在环
  if (result.length !== graph.size) {
    throw new Error("Graph has a cycle, topological sort not possible.");
  }
  return result;
}
```

---

### 对比小结

| 遍历方式     | 数据结构       | 典型应用                     | 时间复杂度     |
| ------------ | -------------- | ---------------------------- | -------------- |
| DFS          | 栈（递归/显式）| 连通分量、回溯、环检测       | O(V + E)       |
| BFS          | 队列           | 最短路径（无权图）、层级遍历 | O(V + E)       |
| 拓扑排序     | 栈 / 队列      | 任务调度、依赖分析           | O(V + E)       |

选择合适的遍历方式取决于具体问题，例如寻找最短路径优先考虑 BFS，探索所有可能性（如迷宫）可用 DFS。拓扑排序则专用于有向无环图，本质是 DFS 或 BFS 思想的延伸。

---

### 4. 环检测（Cycle Detection）

环检测用于判断图中是否存在回路。无向图和有向图的检测策略不同：

| 场景     | 常用方法                   | 核心区别                         |
| -------- | -------------------------- | -------------------------------- |
| 无向图   | DFS 记录父节点 / 并查集    | 遇到已访问节点时需排除父节点     |
| 有向图   | DFS 三色标记               | 区分"正在访问"和"已完成"         |

---

#### 4.1 无向图 — DFS 检测

遍历过程中为每个节点记录其父节点。若遇到已访问的邻居且该邻居不是父节点，则存在环。

```typescript
function hasCycleUndirected<T>(graph: Graph<T>): boolean {
  const visited = new Set<T>();

  function dfs(vertex: T, parent: T | null): boolean {
    visited.add(vertex);
    for (const neighbor of graph.get(vertex) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, vertex)) return true;
      } else if (neighbor !== parent) {
        return true; // 遇到非父的已访问节点 → 有环
      }
    }
    return false;
  }

  // 遍历所有连通分量
  for (const vertex of graph.keys()) {
    if (!visited.has(vertex)) {
      if (dfs(vertex, null)) return true;
    }
  }
  return false;
}
```

---

#### 4.2 无向图 — 并查集（Union-Find）

逐条处理边，若一条边的两个端点已在同一集合中，说明形成了环。

```typescript
function hasCycleUnionFind<T>(graph: Graph<T>): boolean {
  const parent = new Map<T, T>();

  function find(x: T): T {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!)); // 路径压缩
    }
    return parent.get(x)!;
  }

  function union(x: T, y: T): boolean {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX === rootY) return false; // 已在同一集合 → 有环
    parent.set(rootX, rootY);
    return true;
  }

  // 初始化
  for (const vertex of graph.keys()) {
    parent.set(vertex, vertex);
  }

  // 处理每条边（无向图每条边只处理一次）
  const seen = new Set<string>();
  for (const [vertex, neighbors] of graph) {
    for (const neighbor of neighbors) {
      const key = [vertex, neighbor].sort().toString();
      if (seen.has(key)) continue;
      seen.add(key);
      if (!union(vertex, neighbor)) return true;
    }
  }
  return false;
}
```

---

#### 4.3 有向图 — DFS 三色标记

用三种状态标记节点：`WHITE`（未访问）、`GRAY`（正在访问，还在递归栈中）、`BLACK`（已完成）。遇到 `GRAY` 节点说明存在回边 → 有环。

```typescript
enum Color {
  WHITE, // 未访问
  GRAY,  // 正在访问（在当前 DFS 路径上）
  BLACK, // 已完成
}

function hasCycleDirected<T>(graph: Graph<T>): boolean {
  const color = new Map<T, Color>();
  for (const vertex of graph.keys()) {
    color.set(vertex, Color.WHITE);
  }

  function dfs(vertex: T): boolean {
    color.set(vertex, Color.GRAY);
    for (const neighbor of graph.get(vertex) ?? []) {
      if (color.get(neighbor) === Color.GRAY) return true;  // 回边 → 有环
      if (color.get(neighbor) === Color.WHITE && dfs(neighbor)) return true;
    }
    color.set(vertex, Color.BLACK);
    return false;
  }

  for (const vertex of graph.keys()) {
    if (color.get(vertex) === Color.WHITE) {
      if (dfs(vertex)) return true;
    }
  }
  return false;
}
```

---

#### 4.4 有向图 — Kahn 算法间接检测

利用拓扑排序的特性：若 Kahn 算法结束后仍有节点未被处理（入度不为 0），则图中必有环。

```typescript
function hasCycleKahn<T>(graph: Graph<T>): boolean {
  const inDegree = new Map<T, number>();
  for (const [vertex, neighbors] of graph) {
    if (!inDegree.has(vertex)) inDegree.set(vertex, 0);
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
    }
  }

  const queue: T[] = [];
  for (const [vertex, degree] of inDegree) {
    if (degree === 0) queue.push(vertex);
  }

  let count = 0;
  while (queue.length > 0) {
    const vertex = queue.shift()!;
    count++;
    for (const neighbor of graph.get(vertex) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return count !== graph.size; // 有未处理节点 → 有环
}
```

---

#### 环检测对比

| 方法             | 适用图类型 | 返回环本身？ | 时间复杂度   | 空间复杂度 |
| ---------------- | ---------- | ------------ | ------------ | ---------- |
| DFS + 父节点     | 无向图     | 可扩展       | O(V + E)     | O(V)       |
| 并查集           | 无向图     | 否           | O(E · α(V))  | O(V)       |
| DFS 三色标记     | 有向图     | 可扩展       | O(V + E)     | O(V)       |
| Kahn 算法        | 有向图     | 否           | O(V + E)     | O(V)       |

> α 为反阿克曼函数，实际可视为常数。若需要输出具体环路径，可在 DFS 中维护路径栈，检测到回边时截取栈中部分即为环。
