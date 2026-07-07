# LRU 缓存

> 标签：设计题、双向链表、哈希表 | 语言：TypeScript | 面试记录：4次，京东一面，百度二面，字节二面2

## 1. 题目理解

设计一个满足 LRU 规则的缓存，要求 `get` 和 `put` 都在 `O(1)` 时间内完成。核心不是会不会用现成容器，而是能不能把最近使用和淘汰最久未使用这两件事拆成常数时间操作。

## 2. 解题思路

用 `Map<number, Node>` 负责 `O(1)` 定位节点，用自定义双向链表维护访问顺序。链表头部表示最近使用，尾部表示最久未使用；`get` 命中后把节点移动到头部，`put` 时如果键已存在就更新并移动到头部，如果超过容量就删除尾部节点。哈希表解决查找快，双向链表解决插入、删除、移动快，所以两个操作都能做到 `O(1)`。

## 3. TypeScript 实现

```typescript
class Node {
  key: number;
  value: number;
  prev: Node | null = null;
  next: Node | null = null;

  constructor(key: number, value: number) {
    this.key = key;
    this.value = value;
  }
}

class LRUCache {
  private capacity: number;
  private cache: Map<number, Node>;
  private head: Node;
  private tail: Node;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.cache = new Map();
    this.head = new Node(0, 0);
    this.tail = new Node(0, 0);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: number): number {
    const node = this.cache.get(key);
    if (!node) return -1;

    this.moveToHead(node);
    return node.value;
  }

  put(key: number, value: number): void {
    const existing = this.cache.get(key);

    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
      return;
    }

    const node = new Node(key, value);
    this.cache.set(key, node);
    this.addToHead(node);

    if (this.cache.size > this.capacity) {
      const removed = this.removeTail();
      this.cache.delete(removed.key);
    }
  }

  private addToHead(node: Node): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }

  private removeNode(node: Node): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  private moveToHead(node: Node): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private removeTail(): Node {
    const node = this.tail.prev!;
    this.removeNode(node);
    return node;
  }
}
```

## 4. 复杂度分析

- 时间复杂度：`get` 和 `put` 都是 `O(1)`
- 空间复杂度：`O(capacity)`

## 5. 易错点

- 只用 `Map` 不够，因为它不能在 `O(1)` 时间里完成任意节点的顺序调整
- 删除最久未使用节点时，淘汰的是链表尾部前一个真实节点，不是哨兵节点
- 更新已有键时不要新建节点，直接改值并移动到头部即可

## 6. 面试怎么说

LRU 的关键是同时满足快速查找和快速调整顺序，所以要把哈希表和双向链表结合起来。哈希表负责通过 key 直接拿到节点，双向链表负责把最近访问的节点挪到头部、把最久未使用的节点从尾部删掉，这样 `get` 和 `put` 都能稳定做到 `O(1)`。
