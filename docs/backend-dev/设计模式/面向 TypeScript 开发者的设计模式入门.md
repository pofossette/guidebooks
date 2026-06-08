# 面向 TypeScript 开发者的设计模式入门

这篇文档面向 **0 基础转后端**、但已经接触过一些 TypeScript 语法的同学。目标不是让你背定义，而是先建立一个判断标准：

- 设计模式本质上是“**常见问题的可复用解法**”
- 它解决的通常不是“代码能不能跑”，而是“**代码以后好不好改**”
- 不要为了用模式而用模式，**先有重复问题，再考虑模式**

本文参考了 JavaGuide 的设计模式整理，但会尽量改成 **TS 后端开发者更熟悉的语境**，例如 `interface`、依赖注入、鉴权中间件、支付渠道、缓存包装、工作流流转等。

参考资料：

- JavaGuide: https://interview.javaguide.cn/system-design/design-pattern.html

---

## 一、先理解：什么是设计模式

你可以把设计模式理解成“写业务代码时常见的套路”。

比如：

- 你要根据不同配置创建不同的对象，这时常想到**工厂模式**
- 你要保证某个全局资源只有一个实例，这时会想到**单例模式**
- 你想在不改原对象核心逻辑的前提下，额外加缓存、日志、权限，这时会想到**代理模式**或**装饰器模式**
- 你有一串审批、校验、过滤步骤，这时会想到**责任链模式**
- 你有多种算法、多种处理策略可切换，这时会想到**策略模式**
- 你有明显的状态流转，例如订单、任务、工单，这时会想到**状态模式**

初学者常见误区：

- 误区 1：设计模式很高深，只有架构师才用
- 事实：很多框架本身就在用设计模式，你平时只是没意识到

- 误区 2：用了模式，代码一定更高级
- 事实：模式用错了，代码反而更绕

- 误区 3：模式是 Java 专属
- 事实：模式和语言无关，只是不同语言的写法不同

对 TS 后端来说，设计模式最常见的价值有 3 个：

1. 降低 `if/else` 和 `switch` 的失控增长
2. 降低模块之间的硬编码依赖
3. 让“新增一种能力”时，尽量少改旧代码

---

## 二、工厂模式

## 2.1 它在解决什么问题

工厂模式的核心思想很简单：

**不要让调用方自己 `new` 一堆具体类，而是把“创建对象”这件事集中起来。**

这适合下面几类场景：

- 根据配置创建不同数据库客户端
- 根据环境创建不同消息发送器
- 根据渠道创建不同支付服务
- 根据文件类型创建不同解析器

如果你把对象创建逻辑散落在业务代码里，后面一变就会到处改。

## 2.2 不用工厂时会怎样

```ts
class AliyunSmsService {
  send(phone: string, content: string) {
    console.log(`aliyun -> ${phone}: ${content}`);
  }
}

class TencentSmsService {
  send(phone: string, content: string) {
    console.log(`tencent -> ${phone}: ${content}`);
  }
}

function sendCode(provider: "aliyun" | "tencent", phone: string, code: string) {
  const content = `验证码：${code}`;

  if (provider === "aliyun") {
    const sms = new AliyunSmsService();
    sms.send(phone, content);
    return;
  }

  const sms = new TencentSmsService();
  sms.send(phone, content);
}
```

问题在于：

- 调用方不只负责“发短信”，还负责“决定实例化谁”
- 新增一个渠道时，要继续改业务函数
- 创建逻辑和业务逻辑耦合在一起

## 2.3 用工厂模式改写

```ts
interface SmsService {
  send(phone: string, content: string): Promise<void>;
}

class AliyunSmsService implements SmsService {
  async send(phone: string, content: string) {
    console.log(`aliyun -> ${phone}: ${content}`);
  }
}

class TencentSmsService implements SmsService {
  async send(phone: string, content: string) {
    console.log(`tencent -> ${phone}: ${content}`);
  }
}

class SmsServiceFactory {
  static create(provider: "aliyun" | "tencent"): SmsService {
    switch (provider) {
      case "aliyun":
        return new AliyunSmsService();
      case "tencent":
        return new TencentSmsService();
      default:
        throw new Error(`Unsupported provider: ${provider satisfies never}`);
    }
  }
}

async function sendCode(provider: "aliyun" | "tencent", phone: string, code: string) {
  const smsService = SmsServiceFactory.create(provider);
  await smsService.send(phone, `验证码：${code}`);
}
```

## 2.4 你应该记住什么

- 工厂模式重点不是“工厂”两个字，而是**封装创建逻辑**
- 调用方只关心“我要一个能发短信的对象”，不关心具体怎么创建
- 这让代码更符合“面向接口编程”

## 2.5 TS 后端中的典型场景

- 创建不同存储实现：本地文件、S3、OSS
- 创建不同搜索客户端：ES、Meilisearch、数据库全文检索
- 创建不同 AI Provider Client：OpenAI、Anthropic、Gemini

## 2.6 什么时候别用

- 只有一个实现，且很稳定
- 创建逻辑非常简单，抽工厂只会增加层级

---

## 三、单例模式

## 3.1 它在解决什么问题

单例模式的目标是：

**一个类在系统里只保留一个实例，并提供统一访问入口。**

这类场景常见于“昂贵资源”或“全局共享资源”：

- 数据库连接池
- 配置中心客户端
- 日志实例
- 进程内缓存实例

## 3.2 一个简单例子

```ts
class ConfigService {
  private static instance: ConfigService | null = null;

  private constructor(
    private readonly config: Record<string, string | undefined>,
  ) {}

  static getInstance() {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService(process.env);
    }

    return ConfigService.instance;
  }

  get(key: string) {
    return this.config[key];
  }
}

const configA = ConfigService.getInstance();
const configB = ConfigService.getInstance();

console.log(configA === configB); // true
```

## 3.3 初学者容易误解的点

单例模式不是说“全世界只能有一个对象”，而是说：

- 在**当前进程**里通常只保留一个实例
- 它强调的是**访问和生命周期管理**

比如 Node.js 服务通常会启动多个进程、多个容器。你在代码里写了单例，也不是“整个集群就一个”。

## 3.4 TS/Node 里一个现实提醒

在 Node.js 里，很多时候你即使不手写“经典单例类”，也可能天然得到接近单例的效果：

- 模块只初始化一次
- 导出的对象会被复用

例如：

```ts
export const logger = {
  info(message: string) {
    console.log(`[info] ${message}`);
  },
};
```

这个模块导出的 `logger` 在很多项目里就够用了，不一定非要写成传统单例类。

## 3.5 什么时候适合用

- 连接池、缓存实例、配置加载器这类“全局共享资源”
- 初始化成本高，不希望重复创建

## 3.6 风险

- 全局状态变多后，测试会变难
- 隐式依赖更强，不如显式注入清晰
- 滥用后容易让代码难以并行测试

## 3.7 实战建议

对 TS 后端来说，优先级通常是：

1. 能用依赖注入就优先依赖注入
2. 确实需要全局共享资源时，再考虑单例
3. 对无状态服务，不要为了“像设计模式”强行写单例

---

## 四、代理模式

## 4.1 它在解决什么问题

代理模式的核心思想是：

**不直接访问真实对象，而是通过一个“代理对象”间接访问。**

代理对象可以在调用前后做一些额外事情，例如：

- 权限校验
- 缓存
- 日志记录
- 限流
- 懒加载

## 4.2 一个缓存代理例子

```ts
interface UserRepository {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

class DbUserRepository implements UserRepository {
  async findById(id: string) {
    console.log(`query db: ${id}`);
    return { id, name: "Alice" };
  }
}

class CachedUserRepositoryProxy implements UserRepository {
  private readonly cache = new Map<string, { id: string; name: string } | null>();

  constructor(private readonly target: UserRepository) {}

  async findById(id: string) {
    if (this.cache.has(id)) {
      console.log(`hit cache: ${id}`);
      return this.cache.get(id) ?? null;
    }

    const result = await this.target.findById(id);
    this.cache.set(id, result);
    return result;
  }
}

const repo = new CachedUserRepositoryProxy(new DbUserRepository());
```

## 4.3 你应该怎么理解

调用方以为自己在用 `UserRepository`，实际上前面多了一层代理。

这层代理：

- 保持和原对象一致的接口
- 额外控制访问过程
- 不一定修改原对象内部实现

## 4.4 TS 后端典型场景

- Repository 的缓存代理
- 第三方 API Client 的重试代理
- RPC/HTTP Client 的鉴权代理
- 读写分离时，对数据访问做路由代理

## 4.5 和装饰器模式的区别

它们很像，因为都在“包一层”。

一个简单区分方法：

- **代理模式**更强调“控制访问”
- **装饰器模式**更强调“增强能力”

当然，真实项目里两者边界可能没有教科书里那么绝对，不必死扣名词。

---

## 五、装饰器模式

## 5.1 它在解决什么问题

装饰器模式的核心是：

**在不修改原对象代码的前提下，给对象动态添加额外功能。**

如果你熟悉 NestJS、Express 中间件、函数包装器，你会发现这种思路非常常见。

## 5.2 一个日志 + 指标装饰例子

```ts
interface PaymentService {
  pay(orderId: string, amount: number): Promise<void>;
}

class StripePaymentService implements PaymentService {
  async pay(orderId: string, amount: number) {
    console.log(`pay ${orderId}, amount=${amount}`);
  }
}

class LoggingPaymentDecorator implements PaymentService {
  constructor(private readonly target: PaymentService) {}

  async pay(orderId: string, amount: number) {
    console.log(`[start] pay ${orderId}`);
    await this.target.pay(orderId, amount);
    console.log(`[done] pay ${orderId}`);
  }
}

class MetricsPaymentDecorator implements PaymentService {
  constructor(private readonly target: PaymentService) {}

  async pay(orderId: string, amount: number) {
    const start = Date.now();
    await this.target.pay(orderId, amount);
    console.log(`[metrics] cost=${Date.now() - start}ms`);
  }
}

const paymentService = new MetricsPaymentDecorator(
  new LoggingPaymentDecorator(new StripePaymentService()),
);
```

## 5.3 为什么它比继承更灵活

如果只靠继承，你可能会得到很多类：

- `LoggingStripePaymentService`
- `MetricsStripePaymentService`
- `LoggingAndMetricsStripePaymentService`

功能一组合，类就爆炸了。

装饰器模式的好处是：

- 功能可以自由叠加
- 不需要为每种组合都建一个新类
- 原始类职责更单一

## 5.4 TS 后端典型场景

- 给 service 增加日志
- 给 repository 增加缓存
- 给 client 增加重试、熔断、超时控制
- 给 handler 增加审计、监控、trace

## 5.5 和 TS 语法里的 `@decorator` 是什么关系

这里要区分两件事：

- **装饰器模式**：一种设计思想
- `@Controller`、`@Injectable` 这类 **TypeScript 装饰器语法**：一种语言/框架机制

它们相关，但不是一回事。

简单理解：

- 装饰器模式说的是“给对象增强功能”
- TS 装饰器语法说的是“可以用注解风格给类、方法、属性附加元信息或行为”

NestJS 大量使用的是后者，但背后的很多设计思路和前者能对应上。

---

## 六、责任链模式

## 6.1 它在解决什么问题

责任链模式适合处理这类问题：

**一个请求要经过多个处理节点，每个节点决定自己要不要处理，以及要不要继续传给下一个节点。**

这在后端里非常常见：

- 请求中间件链
- 参数校验链
- 审批流
- 风控规则链
- 订单创建前的一系列检查

## 6.2 一个订单校验例子

```ts
type CreateOrderCommand = {
  userId: string;
  items: Array<{ skuId: string; count: number }>;
};

interface Handler {
  setNext(handler: Handler): Handler;
  handle(command: CreateOrderCommand): Promise<void>;
}

abstract class BaseHandler implements Handler {
  private nextHandler: Handler | null = null;

  setNext(handler: Handler) {
    this.nextHandler = handler;
    return handler;
  }

  async handle(command: CreateOrderCommand) {
    if (this.nextHandler) {
      await this.nextHandler.handle(command);
    }
  }
}

class EmptyItemsHandler extends BaseHandler {
  async handle(command: CreateOrderCommand) {
    if (command.items.length === 0) {
      throw new Error("订单商品不能为空");
    }

    await super.handle(command);
  }
}

class UserPermissionHandler extends BaseHandler {
  async handle(command: CreateOrderCommand) {
    if (!command.userId) {
      throw new Error("用户不存在");
    }

    await super.handle(command);
  }
}

class StockHandler extends BaseHandler {
  async handle(command: CreateOrderCommand) {
    console.log("检查库存", command.items);
    await super.handle(command);
  }
}

const emptyItemsHandler = new EmptyItemsHandler();
const userPermissionHandler = new UserPermissionHandler();
const stockHandler = new StockHandler();

emptyItemsHandler.setNext(userPermissionHandler).setNext(stockHandler);
```

## 6.3 你应该看到的重点

- 每个节点只做一件事
- 节点顺序可以调整
- 可以随时插入新节点
- 某个节点可以中断整条链

## 6.4 TS 后端中的现实映射

最典型的就是中间件链：

- Express middleware
- Koa middleware
- NestJS guard / interceptor / pipe 的组合处理

虽然实现细节不同，但背后的思想非常接近责任链。

## 6.5 什么时候适合用

- 一组步骤可拆分、可重排、可扩展
- 你不想把所有逻辑塞进一个超长函数

## 6.6 风险

- 链条太长时，调试不直观
- 执行顺序一旦混乱，问题会很隐蔽
- 过度抽象后，新人不容易看懂流程

---

## 七、策略模式

## 7.1 它在解决什么问题

策略模式非常重要，很多业务系统都会用到。

它的核心思想是：

**把一组可互相替换的算法或处理规则封装起来，在运行时按条件选择其中一种。**

你可以把它理解成：

- 不是写一坨大 `if/else`
- 而是把“每一种处理方式”抽成独立策略

## 7.2 一个优惠计算例子

```ts
interface PricingStrategy {
  calculate(amount: number): number;
}

class NoDiscountStrategy implements PricingStrategy {
  calculate(amount: number) {
    return amount;
  }
}

class PercentageDiscountStrategy implements PricingStrategy {
  constructor(private readonly percentage: number) {}

  calculate(amount: number) {
    return amount * (1 - this.percentage);
  }
}

class FullReductionStrategy implements PricingStrategy {
  constructor(
    private readonly threshold: number,
    private readonly reduction: number,
  ) {}

  calculate(amount: number) {
    return amount >= this.threshold ? amount - this.reduction : amount;
  }
}

class PricingService {
  constructor(private readonly strategy: PricingStrategy) {}

  calculateFinalPrice(amount: number) {
    return this.strategy.calculate(amount);
  }
}
```

## 7.3 为什么它比 `if/else` 好

假设你有这些规则：

- 普通用户无折扣
- VIP 打 9 折
- 满 200 减 30
- 新用户首单立减
- 黑五活动特殊计算

如果全部写进一个函数里，很容易变成：

```ts
if (userType === "vip") { ... }
else if (campaignType === "black-friday") { ... }
else if (isFirstOrder) { ... }
```

后果通常是：

- 条件越来越多
- 规则互相影响
- 新增规则要改旧代码
- 测试覆盖越来越痛苦

策略模式把每种规则拆开后：

- 规则职责更清楚
- 更容易单独测试
- 更适合配置化和扩展

## 7.4 TS 后端典型场景

- 支付渠道选择
- 推荐排序策略
- 权限判定策略
- 搜索召回策略
- 消息发送策略
- 不同租户的计费规则

## 7.5 和工厂模式的关系

这两个模式经常一起出现：

- **策略模式**负责“有哪些可切换的行为”
- **工厂模式**负责“根据条件创建哪一个策略对象”

比如：

- 工厂根据 `tenantId` 创建不同 `PricingStrategy`
- 具体价格计算由策略执行

---

## 八、状态模式

## 8.1 它在解决什么问题

状态模式适合这种场景：

**一个对象在不同状态下，行为不同，而且状态之间还会发生流转。**

如果你做后端业务，很快就会碰到：

- 订单：待支付、已支付、已发货、已完成、已取消
- 工单：待处理、处理中、已解决、已关闭
- 审批单：草稿、待审批、已通过、已驳回

## 8.2 不用状态模式时常见的问题

很多初学者会先这样写：

```ts
type OrderStatus =
  | "pending"
  | "paid"
  | "shipped"
  | "completed"
  | "cancelled";

class OrderService {
  pay(status: OrderStatus) {
    if (status !== "pending") {
      throw new Error("只有待支付订单才能支付");
    }
  }

  ship(status: OrderStatus) {
    if (status !== "paid") {
      throw new Error("只有已支付订单才能发货");
    }
  }

  complete(status: OrderStatus) {
    if (status !== "shipped") {
      throw new Error("只有已发货订单才能完成");
    }
  }
}
```

刚开始还行，但状态和动作一多，代码会迅速膨胀。

## 8.3 用状态模式改写

```ts
interface OrderState {
  pay(): OrderState;
  ship(): OrderState;
  complete(): OrderState;
  cancel(): OrderState;
  name: string;
}

class PendingState implements OrderState {
  name = "pending";

  pay() {
    return new PaidState();
  }

  ship() {
    throw new Error("待支付订单不能发货");
  }

  complete() {
    throw new Error("待支付订单不能完成");
  }

  cancel() {
    return new CancelledState();
  }
}

class PaidState implements OrderState {
  name = "paid";

  pay() {
    throw new Error("订单已支付");
  }

  ship() {
    return new ShippedState();
  }

  complete() {
    throw new Error("已支付未发货订单不能完成");
  }

  cancel() {
    throw new Error("已支付订单不能直接取消");
  }
}

class ShippedState implements OrderState {
  name = "shipped";

  pay() {
    throw new Error("已发货订单不能支付");
  }

  ship() {
    throw new Error("订单已发货");
  }

  complete() {
    return new CompletedState();
  }

  cancel() {
    throw new Error("已发货订单不能取消");
  }
}

class CompletedState implements OrderState {
  name = "completed";

  pay() {
    throw new Error("已完成订单不能支付");
  }

  ship() {
    throw new Error("已完成订单不能发货");
  }

  complete() {
    throw new Error("订单已完成");
  }

  cancel() {
    throw new Error("已完成订单不能取消");
  }
}

class CancelledState implements OrderState {
  name = "cancelled";

  pay() {
    throw new Error("已取消订单不能支付");
  }

  ship() {
    throw new Error("已取消订单不能发货");
  }

  complete() {
    throw new Error("已取消订单不能完成");
  }

  cancel() {
    throw new Error("订单已取消");
  }
}

class Order {
  constructor(private state: OrderState = new PendingState()) {}

  getStatus() {
    return this.state.name;
  }

  pay() {
    this.state = this.state.pay();
  }

  ship() {
    this.state = this.state.ship();
  }

  complete() {
    this.state = this.state.complete();
  }

  cancel() {
    this.state = this.state.cancel();
  }
}
```

## 8.4 它的价值是什么

- 状态规则集中管理
- 每个状态的行为边界更清楚
- 新增状态或调整流转时，更容易定位修改点

## 8.5 TS 后端典型场景

- 订单流转
- 发布流程
- 审核流程
- 异步任务生命周期
- 工单/审批流系统

## 8.6 什么时候别用

- 只有 2 个简单状态
- 没有复杂流转规则
- 写成普通枚举 + 简单判断就足够

---

## 九、这些模式之间怎么区分

很多初学者学到后面会混。

可以先记这个“粗粒度判断”：

| 模式 | 重点关键词 | 你要先想到的问题 |
|---|---|---|
| 工厂模式 | 创建对象 | “这个对象到底该怎么创建？” |
| 单例模式 | 唯一实例 | “这个资源是否应该全局只保留一份？” |
| 代理模式 | 控制访问 | “访问真实对象前后，是否要做控制？” |
| 装饰器模式 | 动态增强 | “不改原对象，能不能叠加功能？” |
| 责任链模式 | 链式处理 | “一个请求是否要经过多个节点？” |
| 策略模式 | 可替换算法 | “这里是不是有多种规则可切换？” |
| 状态模式 | 状态流转 | “对象在不同状态下行为是否不同？” |

再给你一个更贴近后端的速记：

- **工厂**：解决“创建谁”
- **策略**：解决“怎么做”
- **状态**：解决“现在处于什么阶段，所以能做什么”
- **责任链**：解决“按顺序过哪些步骤”
- **代理 / 装饰器**：解决“在原逻辑外面再包一层”
- **单例**：解决“是不是只留一个共享实例”

---

## 十、对 0 基础后端学习者的建议

如果你刚从前端或纯 TS 语法学习转向后端，不建议一开始就死记硬背设计模式定义。

更好的学习顺序是：

1. 先能写出基础 CRUD、鉴权、数据库访问、接口分层
2. 当你发现代码开始出现重复和分支爆炸，再回来看模式
3. 把模式和真实业务问题绑定记忆

例如：

- 看到多渠道支付，就想策略模式
- 看到多 provider 初始化，就想工厂模式
- 看到中间件流水线，就想责任链模式
- 看到订单流转，就想状态模式
- 看到缓存包装、日志包装，就想代理或装饰器

对初学者来说，最值得优先掌握的不是“术语定义最完整”，而是下面这三件事：

1. 什么时候代码已经开始烂了
2. 哪种模式能降低改动成本
3. 模式用了之后，是否真的比原来更清晰

---

## 十一、面试或工作中怎么表达

如果面试官问你“你怎么理解设计模式”，不建议背书式回答。

可以更像工程师一样表达：

> 我理解设计模式不是固定模板，而是处理常见设计问题的经验总结。  
> 对 TS 后端开发来说，我更关注它能不能解决真实问题，比如减少分支爆炸、隔离可变规则、降低模块耦合。  
> 比如支付渠道适合用策略模式，不同客户端创建适合用工厂模式，订单流转适合用状态模式，中间件处理链适合用责任链模式。

这种说法通常比只背“定义”更像真正用过代码的人。

---

## 十二、最后总结

如果只记一句话：

**设计模式不是为了显得高级，而是为了让代码在变化到来时没那么痛苦。**

对 TS 后端开发者，尤其是 0 基础转后端的同学，先优先掌握这 4 个：

1. 策略模式
2. 工厂模式
3. 责任链模式
4. 状态模式

因为它们在业务系统里最常见，也最容易和真实后端场景对应起来。

而单例、代理、装饰器则更适合你在写基础设施层、封装通用能力时逐步理解。

当你以后看到框架源码、依赖注入容器、中间件系统、支付渠道封装、工作流状态机时，会越来越发现：  
很多“高级框架”，本质上只是把这些模式组织得更系统。
