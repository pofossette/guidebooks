# TypeScript 手写设计模式

面试高频的三个设计模式：**发布订阅**、**观察者**、**工厂模式**。下面用 TypeScript 从零实现，每个模式都给出完整类型定义、代码实现和对比分析。

---

## 1. 观察者模式（Observer Pattern）

> 对象间**一对多**的依赖关系：当被观察者状态变化时，自动通知所有观察者。

### 1.1 核心接口定义

```typescript
// 观察者接口：收到通知时执行 update
interface Observer<T> {
  update(data: T): void;
}

// 被观察者接口
interface Subject<T> {
  subscribe(observer: Observer<T>): void;
  unsubscribe(observer: Observer<T>): void;
  notify(data: T): void;
}
```

### 1.2 完整实现

```typescript
class EventEmitter<T> implements Subject<T> {
  private observers: Set<Observer<T>> = new Set();

  subscribe(observer: Observer<T>): void {
    this.observers.add(observer);
  }

  unsubscribe(observer: Observer<T>): void {
    this.observers.delete(observer);
  }

  notify(data: T): void {
    // 遍历时用 snapshot（Array.from），防止回调里 unsubscribe 导致迭代异常
    for (const observer of Array.from(this.observers)) {
      observer.update(data);
    }
  }
}
```

### 1.3 使用示例

```typescript
// 具体观察者
class Logger implements Observer<string> {
  update(data: string): void {
    console.log(`[LOG] ${data}`);
  }
}

class AlertService implements Observer<string> {
  update(data: string): void {
    if (data.includes('error')) {
      console.log(`[ALERT] 触发告警: ${data}`);
    }
  }
}

// 使用
const subject = new EventEmitter<string>();
const logger = new Logger();
const alert = new AlertService();

subject.subscribe(logger);
subject.subscribe(alert);
subject.notify('server error occurred');
// [LOG] server error occurred
// [ALERT] 触发告警: server error occurred
```

### 1.4 复杂度

| 操作 | 时间复杂度 | 说明 |
|------|-----------|------|
| subscribe | O(1) | Set.add |
| unsubscribe | O(1) | Set.delete |
| notify | O(n) | n = 观察者数量 |

---

## 2. 发布订阅模式（Publish-Subscribe Pattern）

> 与观察者模式的关键区别：发布者和订阅者之间有一个**事件中心（EventChannel）**作为中介，双方**互相不知道对方的存在**。

### 2.1 事件类型约束

```typescript
// 用映射类型约束事件名和 payload 的对应关系，避免手写字符串拼错
interface EventMap {
  'user:login': { userId: string; timestamp: number };
  'user:logout': { userId: string };
  'order:created': { orderId: string; amount: number };
  'order:paid': { orderId: string };
}
```

### 2.2 完整实现

```typescript
type EventHandler<T> = (data: T) => void;

class EventBus<Events extends Record<string, any>> {
  // 每个事件名 -> 一组回调
  private channels: Map<keyof Events, Set<EventHandler<any>>> = new Map();

  // 订阅
  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    if (!this.channels.has(event)) {
      this.channels.set(event, new Set());
    }
    this.channels.get(event)!.add(handler);

    // 返回取消订阅函数，调用即退订，无需持有 handler 引用
    return () => this.off(event, handler);
  }

  // 一次性订阅
  once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    const wrapper: EventHandler<Events[K]> = (data) => {
      handler(data);
      this.off(event, wrapper); // 触发一次后自动移除
    };
    return this.on(event, wrapper);
  }

  // 取消订阅
  off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void {
    this.channels.get(event)?.delete(handler);
  }

  // 发布
  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    for (const handler of Array.from(this.channels.get(event) ?? [])) {
      handler(data);
    }
  }

  // 清空某个事件的所有订阅
  clear<K extends keyof Events>(event: K): void {
    this.channels.delete(event);
  }

  // 全部清空
  destroy(): void {
    this.channels.clear();
  }
}
```

### 2.3 使用示例

```typescript
const bus = new EventBus<EventMap>();

// 订阅
const unsub = bus.on('user:login', ({ userId, timestamp }) => {
  console.log(`${userId} logged in at ${timestamp}`);
});

// 一次性订阅
bus.once('order:created', ({ orderId, amount }) => {
  console.log(`新订单 ${orderId}: ¥${amount}`);
});

// 发布
bus.emit('user:login', { userId: 'u001', timestamp: Date.now() });
bus.emit('order:created', { orderId: 'o001', amount: 99.9 });

// 取消订阅
unsub(); // 返回的函数直接调用，不需要传 handler
```

### 2.4 复杂度

| 操作 | 时间复杂度 | 说明 |
|------|-----------|------|
| on / once | O(1) | Map + Set 查找 + 插入 |
| off | O(1) | Set.delete |
| emit | O(n) | n = 该事件的订阅者数量 |

---

## 3. 观察者 vs 发布订阅

| 维度 | 观察者模式 | 发布订阅模式 |
|------|-----------|-------------|
| 耦合度 | 被观察者直接持有观察者引用 | 通过事件中心解耦，发布者不感知订阅者 |
| 通信方式 | Subject 直接调用 observer.update() | EventBus 间接分发 |
| 灵活性 | 适合简单的一对多通知 | 支持多对多、跨模块通信 |
| 典型应用 | Vue 2 响应式（`Object.defineProperty`）、RxJS `Subject` | Vue 3 `mitt`、Node.js `EventEmitter`、浏览器 `CustomEvent` |

**面试要点**：两者的核心差异是**有没有中间的事件调度中心**。观察者是"被观察者直接通知观察者"，发布订阅是"发布者 -> 事件中心 -> 订阅者"。

---

## 4. 工厂模式（Factory Pattern）

工厂模式的核心思想：**将对象的创建逻辑集中管理**，调用方不需要知道具体类，只需告诉工厂"我要什么"。

### 4.1 简单工厂（Simple Factory）

> 不属于 GoF 23 种设计模式，但在实际开发中最常用。

```typescript
// 产品接口
interface Notification {
  send(message: string): void;
}

// 具体产品
class EmailNotification implements Notification {
  send(message: string): void {
    console.log(`[Email] ${message}`);
  }
}

class SMSNotification implements Notification {
  send(message: string): void {
    console.log(`[SMS] ${message}`);
  }
}

class PushNotification implements Notification {
  send(message: string): void {
    console.log(`[Push] ${message}`);
  }
}

// 工厂：集中创建逻辑，新增类型只需改这一处
type NotificationType = 'email' | 'sms' | 'push';

class NotificationFactory {
  static create(type: NotificationType): Notification {
    switch (type) {
      case 'email': return new EmailNotification();
      case 'sms':   return new SMSNotification();
      case 'push':  return new PushNotification();
      default:
        // 利用 never 做穷尽性检查，编译期捕获遗漏
        const _: never = type;
        throw new Error(`Unknown type: ${_}`);
    }
  }
}

// 使用
const notifier = NotificationFactory.create('email');
notifier.send('Hello');
```

### 4.2 工厂方法（Factory Method）

> 定义一个创建对象的接口，但将具体实例化延迟到子类。

```typescript
// 抽象产品
abstract class Transport {
  abstract deliver(): void;
}

class Truck extends Transport {
  deliver(): void {
    console.log('通过公路运输');
  }
}

class Ship extends Transport {
  deliver(): void {
    console.log('通过海运运输');
  }
}

// 抽象工厂：声明工厂方法，子类决定创建哪种产品
abstract class Logistics {
  // 工厂方法：抽象的，子类必须实现
  protected abstract createTransport(): Transport;

  // 业务逻辑依赖抽象产品，不关心具体是 Truck 还是 Ship
  planDelivery(): void {
    const transport = this.createTransport();
    transport.deliver();
  }
}

class RoadLogistics extends Logistics {
  protected createTransport(): Transport {
    return new Truck();
  }
}

class SeaLogistics extends Logistics {
  protected createTransport(): Transport {
    return new Ship();
  }
}

// 使用
const logistics: Logistics = new RoadLogistics();
logistics.planDelivery(); // 通过公路运输
```

### 4.3 抽象工厂（Abstract Factory）

> 提供一个接口，用于创建**一族相关或相互依赖**的对象，无需指定具体类。

```typescript
// 产品族：同一主题下的多个组件
interface Button {
  render(): void;
}

interface Dialog {
  show(): void;
}

// 抽象工厂：生产一整套 UI 组件
interface UIFactory {
  createButton(): Button;
  createDialog(): Dialog;
}

// ---- Web 主题 ----
class WebButton implements Button {
  render(): void {
    console.log('<button class="web-btn">');
  }
}

class WebDialog implements Dialog {
  show(): void {
    console.log('<div class="web-dialog">');
  }
}

class WebUIFactory implements UIFactory {
  createButton(): Button {
    return new WebButton();
  }
  createDialog(): Dialog {
    return new WebDialog();
  }
}

// ---- Mobile 主题 ----
class MobileButton implements Button {
  render(): void {
    console.log('<TouchableOpacity style={styles.btn}>');
  }
}

class MobileDialog implements Dialog {
  show(): void {
    console.log('<Modal visible={true}>');
  }
}

class MobileUIFactory implements UIFactory {
  createButton(): Button {
    return new MobileButton();
  }
  createDialog(): Dialog {
    return new MobileDialog();
  }
}

// 使用：切换主题只需换一个 Factory，所有组件自动配套
function buildUI(factory: UIFactory) {
  const button = factory.createButton();
  const dialog = factory.createDialog();
  button.render();
  dialog.show();
}

buildUI(new WebUIFactory());    // 全套 Web 组件
buildUI(new MobileUIFactory()); // 全套 Mobile 组件
```

---

## 5. 三种工厂模式对比

| 维度 | 简单工厂 | 工厂方法 | 抽象工厂 |
|------|---------|---------|---------|
| 复杂度 | 最低，一个静态方法 | 中等，一个抽象类 + 多个子类 | 最高，多产品族的接口矩阵 |
| 扩展方式 | 改 switch（违反开闭原则） | 新增子类即可扩展 | 新增工厂实现即可扩展 |
| 适用场景 | 产品种类少且稳定 | 产品种类可能增加 | 需要生产一整套关联产品 |
| 典型应用 | `document.createElement()` | React 的 `createElement` 调度、Java `Collection.iterator()` | 数据库驱动（MySQL/PG 工厂各生产自己的 Connection、Command） |

---

## 6. 面试速记口诀

```
观察者：被观察者直接持有观察者，状态变了直接调 update
发布订阅：中间有事件中心解耦，on/emit 隔离，互不感知
简单工厂：一个函数 switch 出产品
工厂方法：子类决定 new 谁
抽象工厂：一整套产品族，换工厂 = 换主题
```
