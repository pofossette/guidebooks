# AI Agent 协作平台 - 系统设计文档

> **面试题**: 设计一个 AI Agent 协作平台  
> **目标公司**: 字节跳动  
> **设计时间**: 50 分钟  
> **设计目标**: 支持 200 人团队使用，多种 Agent 类型，知识共享，成本可控

---

## 📋 目录

1. [需求分析](#1-需求分析)
2. [高层架构设计](#2-高层架构设计)
3. [核心组件详解](#3-核心组件详解)
4. [数据流设计](#4-数据流设计)
5. [深入设计：知识库服务](#5-深入设计知识库服务)
6. [关键设计权衡](#6-关键设计权衡)
7. [可扩展性与可靠性](#7-可扩展性与可靠性)
8. [成本优化策略](#8-成本优化策略)
9. [技术选型总结](#9-技术选型总结)
10. [扩展路线图](#10-扩展路线图)

---

## 1. 需求分析

### 1.1 业务场景

为中型科技公司（~500人）设计内部 AI Agent 协作平台，主要面向研发团队（~200人）。

### 1.2 核心需求

| 需求 | 说明 | 优先级 |
|------|------|--------|
| **多类型 Agent** | 代码生成、文档撰写、数据分析、ToB 客服（技术支持）等 | P0 |
| **Agent 协作** | 支持多 Agent 协作完成复杂任务 | P0 |
| **知识共享** | Agent 间共享经验、最佳实践和陷阱 | P0 |
| **实时监控** | 追踪 Agent 执行过程和性能 | P1 |
| **成本控制** | 避免 LLM API 调用费用爆炸 | P1 |

### 1.3 业务约束

#### 用户规模
- 活跃用户: ~200 人
- 日常同时在线: ~50 人
- 峰值并发: ~100-150 人
- Agent 并发会话: 30-50 个

#### 成本预算
- 每月 LLM API 预算: $5,000-10,000
- 约束: 高优先级但不接受工作流打断
- 策略: 可降级服务、限流，但不能中断正在执行的 Agent

#### 安全要求
- 三级权限控制: L1 公开知识 → L2 团队知识 → L3 机密知识
- 所有访问审计日志
- 敏感操作需用户确认

#### 知识来源
- Agent 自动学习 (40%): 成功任务自动提取
- 人工标注 (30%): Tech Lead 审核和补充
- 用户反馈 (30%): 用户评价驱动

#### 知识一致性
- 版本化 + 审核机制
- 冲突检测 + 优先级（人工标注 > Agent 学习 > 用户反馈）
- 每周自动一致性检查

#### 部署环境
- 已有 Kubernetes 集群，可在此基础上扩展

---

## 2. 高层架构设计

### 2.1 架构概览图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          用户层 (User Layer)                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ 代码生成  │ │ 文档撰写  │ │ 数据分析  │ │  客服     │ │ 自定义    │     │
│  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
│       │            │            │            │            │              │
└───────┼────────────┼────────────┼────────────┼────────────┼──────────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        网关层 (Gateway Layer)                           │
│                                                                         │
│    ┌──────────────────────────────────────────────────────────┐        │
│    │              API Gateway + Load Balancer                  │        │
│    │    • 认证鉴权 • 限流 • 路由 • 请求聚合 • 协议转换        │        │
│    └──────────────────────┬───────────────────────────────────┘        │
│                           │                                             │
│    ┌──────────────────────▼───────────────────────────────────┐        │
│    │              Agent Orchestrator (协调器)                   │        │
│    │    • Agent 生命周期管理 • 任务分配 • 协作调度 • 状态监控   │        │
│    └──────────────────────┬───────────────────────────────────┘        │
└───────────────────────────┼─────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  消息队列     │   │  状态存储     │   │  监控系统     │
│  (Kafka)     │   │  (PostgreSQL)│   │  (Prometheus)│
└──────────────┘   └──────────────┘   └──────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────────────┐
│                       核心服务层 (Core Services)                         │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │  知识库服务      │  │  Agent 执行器   │  │  协作引擎       │        │
│  │  (Knowledge)    │  │  (Executor)     │  │  (Collaboration)│        │
│  │                 │  │                 │  │                 │        │
│  │ • 知识存储       │  │ • 代码执行       │  │ • 多 Agent 协作  │        │
│  │ • 版本控制       │  │ • 工具调用       │  │ • 任务分解       │        │
│  │ • 冲突检测       │  │ • 安全沙箱       │  │ • 结果合并       │        │
│  │ • 权限隔离       │  │ • 超时控制       │  │ • 错误恢复       │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │  安全网关        │  │  成本控制器     │  │  审计日志       │        │
│  │  (Security)     │  │  (Cost Control) │  │  (Audit)        │        │
│  │                 │  │                 │  │                 │        │
│  │ • 权限验证       │  │ • 预算追踪       │  │ • 操作记录       │        │
│  │ • 知识访问控制   │  │ • 降级策略       │  │ • 合规检查       │        │
│  │ • 敏感数据过滤   │  │ • 使用量统计     │  │ • 审计查询       │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        存储层 (Storage Layer)                           │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │  向量数据库      │  │  关系数据库     │  │  对象存储       │        │
│  │  (Milvus)      │  │  (PostgreSQL)  │  │  (MinIO)       │        │
│  │                 │  │                 │  │                 │        │
│  │ • 知识嵌入       │  │ • 用户数据       │  │ • Agent 配置    │        │
│  │ • 语义检索       │  │ • 知识元数据     │  │ • 执行日志       │        │
│  │ • 相似度匹配     │  │ • 权限信息       │  │ • 大文件存储     │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐                              │
│  │  缓存层         │  │  消息队列        │                              │
│  │  (Redis)       │  │  (Kafka)        │                              │
│  │                 │  │                 │                              │
│  │ • 会话状态       │  │ • 异步消息       │                              │
│  │ • 热点知识       │  │ • 事件驱动       │                              │
│  │ • 限流计数器     │  │ • 日志聚合       │                              │
│  └─────────────────┘  └─────────────────┘                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 架构分层说明

| 层级 | 职责 | 特点 |
|------|------|------|
| **用户层** | 各类 Agent 实例 | 多样化、专业化 |
| **网关层** | 统一入口、认证、路由、调度 | 无状态、水平扩展 |
| **核心服务层** | 业务逻辑、知识管理、协作 | 微服务架构 |
| **存储层** | 数据持久化、缓存、消息 | 多种存储适配 |

---

## 3. 核心组件详解

### 3.1 网关层 (Gateway Layer)

#### API Gateway

| 功能 | 实现方式 | 说明 |
|------|---------|------|
| **认证鉴权** | OAuth 2.0 + JWT | 与公司 SSO 集成 |
| **限流** | 令牌桶算法 | 按用户、按 Agent 类型限流 |
| **路由** | 动态路由表 | 基于 Agent 类型和负载均衡 |
| **请求聚合** | GraphQL Federation | 合并多个服务的响应 |
| **协议转换** | REST ↔ gRPC | 内部使用 gRPC，外部 REST |

**技术选型**: Kong / Traefik  
**扩展性**: 支持水平扩展，多实例部署

#### Agent Orchestrator

| 功能 | 实现方式 | 说明 |
|------|---------|------|
| **生命周期管理** | 状态机 | 创建 → 运行 → 完成/失败 |
| **任务分配** | 负载均衡 + 亲和性 | 相似任务分配给相同 Agent |
| **协作调度** | DAG 编排 | 多 Agent 依赖关系调度 |
| **状态监控** | 事件驱动 | 实时更新任务状态 |

**数据存储**: PostgreSQL（任务元数据）+ Redis（实时状态）

---

### 3.2 核心服务层 (Core Services)

#### 知识库服务 (Knowledge Service)

| 功能 | 实现方式 | 说明 |
|------|---------|------|
| **知识存储** | PostgreSQL + Milvus | 结构化 + 向量化 |
| **版本控制** | 乐观锁 + 历史表 | 每次修改生成新版本 |
| **冲突检测** | LLM + 语义相似度 | 自动检测矛盾和过期 |
| **权限隔离** | RBAC + 行级安全 | 按团队、按知识级别隔离 |

**详细设计**: 见 [第 5 节](#5-深入设计知识库服务)

#### Agent 执行器 (Executor)

| 功能 | 实现方式 | 说明 |
|------|---------|------|
| **代码执行** | 沙箱容器 | Docker / Firecracker |
| **工具调用** | 函数注册表 | Agent 可调用的工具清单 |
| **安全沙箱** | 权限隔离 + 资源限制 | CPU、内存、网络、文件系统 |
| **超时控制** | 定时器 + 事件 | 超时自动终止并记录 |

**安全考虑**:
- 所有代码执行在沙箱中
- 网络访问白名单
- 文件系统只读挂载
- 资源配额限制

#### 协作引擎 (Collaboration Engine)

| 功能 | 实现方式 | 说明 |
|------|---------|------|
| **任务分解** | LLM 分析 | 自动分解为子任务 |
| **结果合并** | 策略模式 | 按任务类型选择合并策略 |
| **冲突解决** | 优先级 + 人工介入 | 自动解决或上报 |
| **错误恢复** | 重试 + 熔断 | 失败任务自动重试 |

**协作模式**:
1. **串行协作**: Agent A → Agent B → Agent C
2. **并行协作**: Agent A + Agent B + Agent C
3. **层级协作**: Orchestrator → Agent A, B, C

#### 安全网关 (Security Gateway)

| 功能 | 实现方式 | 说明 |
|------|---------|------|
| **权限验证** | Redis 缓存 + PostgreSQL | 快速验证 + 持久化存储 |
| **知识访问控制** | RBAC + ABAC | 角色 + 属性混合控制 |
| **敏感数据过滤** | 正则 + NLP | 自动脱敏 |

**权限模型**:
```
用户 ─┬─ 角色 ─┬─ Team Admin → 访问 L1, L2, L3
      │        ├─ Developer → 访问 L1, L2
      │        └─ Viewer → 访问 L1
      └─ 资源 ─┬─ 知识库
               ├─ Agent
               └─ 工具
```

#### 成本控制器 (Cost Controller)

| 功能 | 实现方式 | 说明 |
|------|---------|------|
| **预算追踪** | Redis + PostgreSQL | 实时计数 + 历史统计 |
| **降级策略** | 策略链 | 渐进式降级 |
| **使用量统计** | 聚合查询 | 按用户、Agent 类型、时间维度 |

**降级策略表**:

| 使用率 | 策略 | 用户体验影响 |
|--------|------|-------------|
| < 80% | 全功能（GPT-4） | 无 |
| 80-95% | 降级模型（GPT-3.5）+ 减少上下文 | 中等 |
| 95-100% | 限流 + 队列等待 | 较大 |
| > 100% | 拒绝新请求 | 严重 |

#### 审计日志 (Audit Log)

| 功能 | 实现方式 | 说明 |
|------|---------|------|
| **操作记录** | Kafka + PostgreSQL | 异步写入，不影响性能 |
| **合规检查** | 规则引擎 | 自动检测违规操作 |
| **审计查询** | Elasticsearch | 全文检索，支持复杂查询 |

**审计内容**:
- 用户操作（登录、调用 Agent、访问知识）
- Agent 执行（LLM 调用、工具调用、返回结果）
- 系统事件（故障、降级、告警）

---

### 3.3 存储层 (Storage Layer)

| 存储 | 用途 | 技术选型 | 选型理由 |
|------|------|---------|---------|
| **关系数据库** | 结构化数据 | PostgreSQL | ACID、成熟、JSON 支持 |
| **向量数据库** | 语义检索 | Milvus | 高性能、分布式、十亿级向量 |
| **缓存** | 热点数据、会话 | Redis | 低延迟、多种数据结构 |
| **消息队列** | 异步消息、事件 | Kafka | 高吞吐、持久化、事件驱动 |
| **对象存储** | 大文件 | MinIO | S3 兼容、低成本 |

---

## 4. 数据流设计

### 4.1 场景 1: 用户提交任务给单个 Agent

```
用户提交任务
    │
    ▼
┌─────────────────┐
│  API Gateway    │  认证、限流、路由
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Agent          │  创建任务，分配 Agent
│  Orchestrator   │
└────────┬────────┘
         │
         ├──────────────────────────────────────────────────────────┐
         │                                                          │
         ▼                                                          ▼
┌─────────────────┐                                        ┌─────────────────┐
│  知识库服务      │  检索相关知识                           │  成本控制器     │
│  (Knowledge)    │  ← 返回相关知识条目                     │  (Cost)        │
└────────┬────────┘                                        │  检查预算       │
         │                                                  │  → 返回允许/拒绝 │
         │                                                  └────────┬────────┘
         │                                                           │
         └──────────────────┬────────────────────────────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Agent 执行器    │  组装 Prompt，调用 LLM
                   │  (Executor)     │
                   └────────┬────────┘
                            │
                            ├────────────────────────────────────────┐
                            │                                        │
                            ▼                                        ▼
                   ┌─────────────────┐                     ┌─────────────────┐
                   │  LLM API        │  生成回答            │  审计日志       │
                   │  (OpenAI/...)   │  ← 流式返回          │  (Audit)       │
                   └────────┬────────┘                     │  记录所有操作   │
                            │                              └─────────────────┘
                            ▼
                   ┌─────────────────┐
                   │  流式返回给用户  │  SSE/WebSocket
                   └─────────────────┘
```

**关键特性**:
- 所有操作**异步**，通过 Kafka 事件驱动
- **成本控制**在 LLM 调用前检查，避免超预算
- 支持**流式响应**，用户实时看到 Agent 输出

---

### 4.2 场景 2: 多 Agent 协作

```
复杂任务提交
    │
    ▼
┌─────────────────┐
│  Agent          │  分析任务，分解为子任务
│  Orchestrator   │  Task = [Subtask A, Subtask B, Subtask C]
└────────┬────────┘
         │
         ├─────────────────────────────────────────────────────┐
         │                                                     │
         ▼                                                     ▼
┌─────────────────┐                                 ┌─────────────────┐
│  子任务 A        │                                 │  子任务 B        │
│  → Agent 1      │                                 │  → Agent 2      │
└────────┬────────┘                                 └────────┬────────┘
         │                                                  │
         │  (并行执行)                                       │
         │                                                  │
         ▼                                                  ▼
┌─────────────────┐                                 ┌─────────────────┐
│  Agent 1        │  返回结果 A                       │  Agent 2        │
│  执行完成       │                                  │  执行完成       │
└────────┬────────┘                                 └────────┬────────┘
         │                                                  │
         └──────────────────┬─────────────────────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  协作引擎        │  合并结果 A + B
                   │  (Collaboration)│  处理冲突（如有）
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  子任务 C        │  基于 A+B 的结果
                   │  → Agent 3      │  继续执行
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  最终结果合并    │  整合所有子任务结果
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  返回给用户      │  完整的执行报告
                   └─────────────────┘
```

**关键特性**:
- Agent 间通过**消息队列**异步通信
- **协作引擎**负责结果合并和冲突解决
- 支持**超时控制**和**重试机制**

---

### 4.3 场景 3: 知识自动学习

```
Agent 任务完成
    │
    ▼
┌─────────────────┐
│  执行报告        │  包含：任务描述、执行过程、结果、用户反馈
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  知识提取器      │  LLM 分析执行报告，提取可复用的知识
│  (Extractor)    │  识别：最佳实践、陷阱、解决方案
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  冲突检测        │  检查新知识是否与现有知识矛盾
│  (Conflict)     │
└────────┬────────┘
         │
         ├─── 无冲突 ───→ 直接入库，状态为 "draft"
         │
         └─── 有冲突 ───→ 生成冲突报告，通知管理员
                            │
                            ▼
                   ┌─────────────────┐
                   │  管理员审核      │  决定：采纳新知识 or 保留旧知识
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  知识入库        │  状态变为 "published"
                   └─────────────────┘
```

---

## 5. 深入设计：知识库服务

### 5.1 数据模型

```sql
-- ============================================
-- 知识条目表 (Knowledge Entries)
-- ============================================
CREATE TABLE knowledge_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version INT DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding_id VARCHAR(100),  -- Milvus 中的向量 ID
    source_type VARCHAR(50) CHECK (source_type IN (
        'agent_auto',      -- Agent 自动学习
        'human_annotated', -- 人工标注
        'user_feedback'    -- 用户反馈
    )),
    confidence_score FLOAT CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    team_id UUID REFERENCES teams(id),
    topic VARCHAR(100),
    tags TEXT[],
    created_by UUID REFERENCES users(id),
    status VARCHAR(20) CHECK (status IN (
        'draft',       -- 草稿，待审核
        'published',   -- 已发布，可用
        'deprecated'   -- 已废弃，不可用
    )),
    access_level VARCHAR(20) CHECK (access_level IN (
        'L1_public',      -- 公开知识
        'L2_team',        -- 团队知识
        'L3_confidential' -- 机密知识
    )),
    usage_count INT DEFAULT 0,
    helpful_count INT DEFAULT 0,
    not_helpful_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- 索引
    INDEX idx_team_status (team_id, status),
    INDEX idx_topic (topic),
    INDEX idx_source_type (source_type),
    INDEX idx_created_at (created_at)
);

-- ============================================
-- 知识版本表 (Knowledge Versions) - 历史版本
-- ============================================
CREATE TABLE knowledge_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES knowledge_entries(id) ON DELETE CASCADE,
    version INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    change_reason TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE (entry_id, version),
    INDEX idx_entry_version (entry_id, version)
);

-- ============================================
-- 知识冲突表 (Knowledge Conflicts)
-- ============================================
CREATE TABLE knowledge_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id_1 UUID REFERENCES knowledge_entries(id),
    entry_id_2 UUID REFERENCES knowledge_entries(id),
    conflict_type VARCHAR(50) CHECK (conflict_type IN (
        'contradiction', -- 矛盾：两个知识相互冲突
        'outdated',      -- 过期：新知识更新了旧知识
        'ambiguity'      -- 歧义：表述不清，可能导致误解
    )),
    severity VARCHAR(20) CHECK (severity IN (
        'low',     -- 轻微，可自动处理
        'medium',  -- 中等，建议人工审核
        'high'     -- 严重，必须人工处理
    )),
    status VARCHAR(20) CHECK (status IN (
        'pending',   -- 待处理
        'resolved',  -- 已解决
        'dismissed'  -- 已忽略
    )),
    resolved_by UUID REFERENCES users(id),
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    
    INDEX idx_status (status),
    INDEX idx_entries (entry_id_1, entry_id_2)
);

-- ============================================
-- 知识访问日志 (Knowledge Access Log)
-- ============================================
CREATE TABLE knowledge_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES knowledge_entries(id),
    user_id UUID REFERENCES users(id),
    agent_id UUID REFERENCES agents(id),
    access_type VARCHAR(20) CHECK (access_type IN (
        'read',     -- 读取
        'update',   -- 更新
        'delete'    -- 删除
    )),
    accessed_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_entry_time (entry_id, accessed_at DESC),
    INDEX idx_user_time (user_id, accessed_at DESC)
);
```

### 5.2 冲突检测算法

```typescript
interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  embedding: number[];
  topic: string;
  teamId: string;
  createdAt: Date;
}

interface KnowledgeConflict {
  entryId1: string;
  entryId2: string;
  conflictType: 'contradiction' | 'outdated' | 'ambiguity';
  severity: 'low' | 'medium' | 'high';
  confidence: number;
}

class ConflictDetector {
  constructor(
    private vectorDB: VectorDB,
    private db: Database,
    private llm: LLMService
  ) {}

  /**
   * 检测新知识与现有知识的冲突
   */
  async detectConflicts(
    newEntry: KnowledgeEntry
  ): Promise<KnowledgeConflict[]> {
    const conflicts: KnowledgeConflict[] = [];

    // ============================================
    // 1. 语义相似度检测（找候选冲突）
    // ============================================
    const similarEntries = await this.vectorDB.search(
      newEntry.embedding,
      {
        topK: 10,
        threshold: 0.85,  // 85% 以上相似度
        filter: {
          teamId: newEntry.teamId,
          status: 'published'
        }
      }
    );

    console.log(`找到 ${similarEntries.length} 个相似条目`);

    // ============================================
    // 2. 内容矛盾检测（使用 LLM）
    // ============================================
    for (const similar of similarEntries) {
      const analysis = await this.llm.analyzeConflict(
        newEntry.content,
        similar.content
      );

      if (analysis.isContradictory) {
        conflicts.push({
          entryId1: newEntry.id,
          entryId2: similar.id,
          conflictType: 'contradiction',
          severity: analysis.severity,
          confidence: similar.similarity
        });
      }
    }

    // ============================================
    // 3. 同一主题的过期检测
    // ============================================
    const outdatedEntries = await this.db.query(`
      SELECT id, content, created_at 
      FROM knowledge_entries 
      WHERE topic = $1 
        AND team_id = $2
        AND status = 'published'
        AND created_at < NOW() - INTERVAL '6 months'
    `, [newEntry.topic, newEntry.teamId]);

    for (const outdated of outdatedEntries) {
      // 使用 LLM 判断是否过时
      const isOutdated = await this.llm.checkOutdated(
        newEntry.content,
        outdated.content
      );

      if (isOutdated) {
        conflicts.push({
          entryId1: newEntry.id,
          entryId2: outdated.id,
          conflictType: 'outdated',
          severity: 'medium',
          confidence: 0.9
        });
      }
    }

    // ============================================
    // 4. 歧义检测（检查表述是否清晰）
    // ============================================
    const ambiguityScore = await this.llm.checkAmbiguity(
      newEntry.content
    );

    if (ambiguityScore > 0.7) {
      // 高歧义分数，标记为可能有问题
      // 这不是冲突，但需要人工审核
      console.log(`新条目歧义分数较高: ${ambiguityScore}`);
    }

    return conflicts;
  }

  /**
   * 使用 LLM 分析两个内容是否矛盾
   */
  private async analyzeWithLLM(
    content1: string,
    content2: string
  ): Promise<{
    isContradictory: boolean;
    severity: 'low' | 'medium' | 'high';
    reasoning: string;
  }> {
    const prompt = `
分析以下两个技术知识条目是否矛盾：

条目 1:
${content1}

条目 2:
${content2}

请回答：
1. 这两个条目是否矛盾？(是/否)
2. 如果矛盾，严重程度如何？(low/medium/high)
3. 矛盾的具体原因

请以 JSON 格式返回。
`;

    const response = await this.llm.generate(prompt);
    return JSON.parse(response);
  }
}
```

### 5.3 知识检索算法

```typescript
interface RetrievalResult {
  entry: KnowledgeEntry;
  score: number;
  reason: string;
}

class KnowledgeRetriever {
  constructor(
    private vectorDB: VectorDB,
    private db: Database,
    private cache: RedisCache
  ) {}

  /**
   * 检索相关知识（混合检索）
   */
  async retrieve(
    query: string,
    context: {
      userId: string;
      teamId: string;
      agentType: string;
      taskType: string;
    },
    options: {
      topK?: number;
      minScore?: number;
      includeDeprecated?: boolean;
    } = {}
  ): Promise<RetrievalResult[]> {
    const { topK = 10, minScore = 0.7, includeDeprecated = false } = options;

    // ============================================
    // 1. 检查缓存
    // ============================================
    const cacheKey = this.buildCacheKey(query, context);
    const cached = await this.cache.get<RetrievalResult[]>(cacheKey);
    if (cached) {
      console.log('命中缓存');
      return cached;
    }

    // ============================================
    // 2. 向量语义检索
    // ============================================
    const queryEmbedding = await this.getEmbedding(query);
    const semanticResults = await this.vectorDB.search(
      queryEmbedding,
      {
        topK: topK * 2,  // 多检索一些，后面过滤
        filter: {
          teamId: context.teamId,
          status: includeDeprecated ? undefined : 'published'
        }
      }
    );

    // ============================================
    // 3. 关键词检索 (BM25)
    // ============================================
    const keywordResults = await this.db.query(`
      SELECT id, title, content, 
             ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
      FROM knowledge_entries
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
        AND team_id = $2
        AND ($3 OR status = 'published')
      ORDER BY rank DESC
      LIMIT $4
    `, [query, context.teamId, includeDeprecated, topK]);

    // ============================================
    // 4. 混合排序 (Reciprocal Rank Fusion)
    // ============================================
    const mergedResults = this.rrfFusion(
      semanticResults,
      keywordResults,
      topK
    );

    // ============================================
    // 5. 过滤低分结果
    // ============================================
    const filteredResults = mergedResults.filter(
      r => r.score >= minScore
    );

    // ============================================
    // 6. 缓存结果
    // ============================================
    await this.cache.set(cacheKey, filteredResults, 300);  // 5 分钟

    return filteredResults.slice(0, topK);
  }

  /**
   * Reciprocal Rank Fusion - 混合多个排序列表
   */
  private rrfFusion(
    semanticResults: any[],
    keywordResults: any[],
    topK: number
  ): RetrievalResult[] {
    const k = 60;  // RRF 常数
    const scores = new Map<string, number>();

    // 语义检索得分
    semanticResults.forEach((result, rank) => {
      const score = 1 / (k + rank + 1);
      scores.set(result.id, (scores.get(result.id) || 0) + score);
    });

    // 关键词检索得分
    keywordResults.forEach((result, rank) => {
      const score = 1 / (k + rank + 1);
      scores.set(result.id, (scores.get(result.id) || 0) + score);
    });

    // 按总分排序
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    return sorted.map(([id, score]) => ({
      entry: this.getEntryById(id),
      score,
      reason: '语义和关键词混合匹配'
    }));
  }
}
```

---

## 6. 关键设计权衡

### 6.1 架构决策表

| 决策点 | 选项 A | 选项 B | 我们的选择 | 理由 |
|--------|--------|--------|-----------|------|
| **Agent 间通信** | 同步 HTTP | 异步消息队列 | ✅ Kafka | 解耦、高吞吐、持久化、支持重放 |
| **知识检索** | 全文搜索 | 向量数据库 | ✅ Milvus | 语义理解、相似度匹配 |
| **知识版本控制** | 实时覆盖 | 版本化 + 审核 | ✅ 版本化 | 可追溯、可回滚、冲突可检测 |
| **成本控制** | 强制中断 | 降级 + 限流 | ✅ 降级 | 不中断工作流 |
| **状态存储** | 内存 | 数据库 | ✅ PostgreSQL | 持久化、支持事务 |
| **缓存策略** | 无缓存 | Redis | ✅ Redis | 低延迟、支持复杂数据结构 |

### 6.2 权衡详细分析

#### **决策 1: 使用消息队列进行 Agent 间通信**

| 维度 | 同步 HTTP | 异步消息队列 (Kafka) |
|------|----------|---------------------|
| **耦合度** | 高，直接依赖 | 低，松耦合 |
| **吞吐量** | 受限于单服务 | 高吞吐，支持百万级/秒 |
| **持久化** | 无 | 有，支持重放 |
| **延迟** | 低（ms 级） | 中等（ms 到秒级） |
| **复杂度** | 低 | 高 |
| **错误恢复** | 困难，调用链断裂 | 容易，重试机制 |

**为什么选择 Kafka**:
- Agent 协作场景需要**高可靠性**和**可追溯性**
- 允许**延迟增加**换取**系统健壮性**
- 事件驱动架构更易于**扩展**和**维护**

---

#### **决策 2: 向量数据库 vs 全文搜索**

| 维度 | 全文搜索 (Elasticsearch) | 向量数据库 (Milvus) |
|------|-------------------------|---------------------|
| **检索方式** | 关键词匹配 | 语义匹配 |
| **适用场景** | 精确匹配 | 模糊理解 |
| **性能** | 高 | 高 |
| **成本** | 低 | 中等 |
| **维护** | 简单 | 中等 |

**为什么选择 Milvus**:
- 知识库需要**语义理解**，而非简单关键词匹配
- 示例：用户问"如何优化性能"，应该匹配"性能调优最佳实践"
- 代价：需要嵌入模型（额外成本），但检索质量大幅提升

---

#### **决策 3: 知识版本控制 vs 实时覆盖**

| 维度 | 实时覆盖 | 版本化 + 审核 |
|------|---------|-------------|
| **实现复杂度** | 低 | 高 |
| **存储成本** | 低 | 高（保留历史版本） |
| **可追溯性** | 无 | 完整 |
| **冲突检测** | 困难 | 容易 |
| **回滚能力** | 无 | 有 |

**为什么选择版本化**:
- 知识冲突会影响 **Agent 可信度**
- 需要**可追溯**和**可回滚**能力
- 代价：存储成本增加，但可接受

---

#### **决策 4: 成本控制策略**

| 维度 | 强制中断 | 降级 + 限流 |
|------|---------|-----------|
| **用户体验** | 严重受损 | 中等受损 |
| **实现复杂度** | 低 | 中等 |
| **成本控制效果** | 立即 | 渐进 |
| **工作流影响** | 中断 | 不中断 |

**为什么不选"强制中断"**:
- 用户明确要求**不中断工作流**
- 正在执行的 Agent 不能丢失状态
- 代价：成本控制有延迟，但用户体验更好

---

## 7. 可扩展性与可靠性

### 7.1 可扩展性设计

#### 水平扩展策略

| 组件 | 扩展方式 | 说明 |
|------|---------|------|
| **API Gateway** | 多实例 + 负载均衡 | 无状态，线性扩展 |
| **Agent Orchestrator** | 多实例 + 分片 | 按 Team 分片 |
| **Agent 执行器** | Kubernetes HPA | 根据负载自动扩缩容 |
| **PostgreSQL** | 读写分离 + 分库分表 | 写主库，读从库 |
| **Redis** | Redis Cluster | 数据分片 |
| **Milvus** | 分布式部署 | 按 Collection 分片 |
| **Kafka** | 多 Partition | 并行消费 |

#### 扩展性指标

| 指标 | 当前设计 | 扩展后 |
|------|---------|--------|
| **并发用户** | 200 人 | 1000+ 人 |
| **Agent 并发会话** | 50 个 | 200+ 个 |
| **知识条目数** | 10 万 | 100 万+ |
| **LLM 调用量/天** | 1000 次 | 10000+ 次 |

### 7.2 可靠性设计

#### 故障恢复机制

```
故障类型          │ 恢复策略                     │ RTO      │ RPO
─────────────────┼────────────────────────────┼──────────┼────────
Agent 执行失败   │ 自动重试（最多 3 次）          │ < 1 分钟  │ 0
LLM API 故障    │ 切换备用 Provider             │ < 5 分钟  │ 0
数据库故障       │ 自动切换到从库                 │ < 1 分钟  │ < 1 秒
缓存故障         │ 降级到数据库查询               │ < 10 秒   │ 0
消息队列故障     │ 消息持久化 + 重放             │ < 5 分钟  │ 0
网络分区         │ 断路器 + 重试                 │ 自动      │ 0
```

#### 数据一致性保障

| 场景 | 一致性级别 | 实现方式 |
|------|-----------|---------|
| **用户信息** | 强一致 | 事务 + 锁 |
| **知识库** | 最终一致 | 版本控制 + 异步同步 |
| **Agent 状态** | 最终一致 | 事件驱动 + 重试 |
| **审计日志** | 最终一致 | Kafka + 异步写入 |

#### 监控告警体系

```yaml
# Prometheus 指标示例
metrics:
  # 系统指标
  - agent_sessions_active  # 活跃 Agent 会话数
  - llm_api_calls_total    # LLM 调用总数
  - llm_api_latency        # LLM 调用延迟
  - llm_api_errors         # LLM 调用错误数
  
  # 业务指标
  - knowledge_entries_total    # 知识条目总数
  - knowledge_conflicts       # 知识冲突数
  - task_completion_rate      # 任务完成率
  - user_satisfaction_score   # 用户满意度
  
  # 成本指标
  - cost_monthly_usage    # 月度使用量
  - cost_budget_remaining # 剩余预算

# 告警规则示例
alerts:
  - name: HighErrorRate
    condition: llm_api_errors > 100 in 5m
    severity: critical
    action: page_oncall
    
  - name: BudgetExceeded
    condition: cost_monthly_usage > 8000
    severity: warning
    action: notify_admin
    
  - name: SlowResponse
    condition: llm_api_latency_p95 > 5000ms
    severity: warning
    action: check_system
```

---

## 8. 成本优化策略

### 8.1 成本构成

| 成本项 | 占比 | 月度预算 | 优化方向 |
|--------|------|---------|---------|
| **LLM API 调用** | 60% | $6,000 | 模型降级、缓存、批量处理 |
| **向量数据库** | 20% | $2,000 | 索引优化、冷热分离 |
| **PostgreSQL** | 10% | $1,000 | 读写分离、归档 |
| **Redis** | 5% | $500 | 内存优化 |
| **其他（网络、存储）** | 5% | $500 | - |

### 8.2 成本控制机制

```typescript
class CostController {
  private monthlyBudget = 10000;  // $10,000
  private alertThreshold = 0.8;   // 80% 时告警
  private criticalThreshold = 0.95; // 95% 时严格限制

  /**
   * 检查预算是否允许
   */
  async checkBudget(
    userId: string,
    agentType: string,
    estimatedTokens: number
  ): Promise<{
    allowed: boolean;
    reason?: string;
    degraded?: boolean;
    suggestedModel?: string;
  }> {
    // ============================================
    // 1. 获取当前使用量
    // ============================================
    const currentUsage = await this.getMonthlyUsage();
    const estimatedCost = estimatedTokens * this.getModelCost(agentType);

    // ============================================
    // 2. 超预算检查
    // ============================================
    if (currentUsage + estimatedCost > this.monthlyBudget) {
      return {
        allowed: false,
        reason: `月度预算已超出。当前: $${currentUsage}, 预算: $${this.monthlyBudget}`
      };
    }

    // ============================================
    // 3. 渐进式降级策略
    // ============================================
    const usageRatio = (currentUsage + estimatedCost) / this.monthlyBudget;

    if (usageRatio > this.criticalThreshold) {
      // 严格限制：降级模型 + 减少上下文
      return {
        allowed: true,
        degraded: true,
        suggestedModel: 'gpt-3.5-turbo',
        reason: '预算紧张，已降级到经济型模型'
      };
    }

    if (usageRatio > this.alertThreshold) {
      // 温和降级：降级模型但保持功能
      return {
        allowed: true,
        degraded: true,
        suggestedModel: 'gpt-3.5-turbo',
        reason: '预算告警，已降级模型以节省成本'
      };
    }

    // ============================================
    // 4. 限流检查
    // ============================================
    const rateLimit = await this.checkRateLimit(userId, agentType);
    if (!rateLimit.allowed) {
      return {
        allowed: false,
        reason: '请求过于频繁，请稍后重试'
      };
    }

    // ============================================
    // 5. 允许通过
    // ============================================
    return { allowed: true };
  }

  /**
   * 根据 Agent 类型和模型计算成本
   */
  private getModelCost(agentType: string): number {
    const costMap: Record<string, number> = {
      'code_generation': 0.00003,  // $0.03 / 1K tokens (GPT-4)
      'documentation': 0.000015,   // $0.015 / 1K tokens (GPT-3.5)
      'data_analysis': 0.00003,
      'customer_service': 0.000015,
      'custom': 0.00002
    };

    return costMap[agentType] || 0.00002;
  }

  /**
   * 生成降级建议
   */
  private getDegradationSuggestion(
    currentModel: string,
    usageRatio: number
  ): {
    model: string;
    contextReduction: number;
    explanation: string;
  } {
    if (usageRatio > 0.95) {
      return {
        model: 'gpt-3.5-turbo',
        contextReduction: 0.5,  // 减少 50% 上下文
        explanation: '预算严重超支，大幅降级'
      };
    }

    if (usageRatio > 0.8) {
      return {
        model: 'gpt-3.5-turbo',
        contextReduction: 0.2,  // 减少 20% 上下文
        explanation: '预算告警，中等降级'
      };
    }

    return {
      model: currentModel,
      contextReduction: 0,
      explanation: '正常运行'
    };
  }
}
```

### 8.3 成本优化技巧

| 技巧 | 实现方式 | 预期节省 |
|------|---------|---------|
| **Prompt 缓存** | Redis 缓存常见 Prompt 模板 | 10-20% |
| **批量处理** | 合并多个请求，减少 API 调用次数 | 15-25% |
| **模型选择** | 根据任务复杂度选择合适模型 | 20-30% |
| **结果缓存** | 缓存相同查询的结果 | 10-15% |
| **异步处理** | 非实时任务异步执行，避免高峰期 | 5-10% |
| **Token 优化** | 压缩 Prompt，减少输入 Token | 10-15% |

---

## 9. 技术选型总结

### 9.1 核心技术栈

| 层级 | 组件 | 技术选型 | 版本 | 选型理由 |
|------|------|---------|------|---------|
| **网关** | API Gateway | Kong | 3.x | 开源、成熟、插件丰富 |
| **编排** | Agent Orchestrator | TypeScript | - | 类型安全、生态成熟 |
| **消息队列** | 事件驱动 | Kafka | 3.x | 高吞吐、持久化、事件驱动 |
| **数据库** | 关系数据 | PostgreSQL | 15+ | ACID、成熟、JSON 支持 |
| **向量数据库** | 语义检索 | Milvus | 2.x | 高性能、分布式、社区活跃 |
| **缓存** | 热点数据 | Redis | 7.x | 低延迟、多种数据结构 |
| **对象存储** | 大文件 | MinIO | - | S3 兼容、低成本 |
| **容器** | 编排 | Kubernetes | 1.28+ | 行业标准、自动扩缩容 |
| **监控** | 指标收集 | Prometheus | 2.x | 开源、灵活、社区活跃 |
| **可视化** | 仪表盘 | Grafana | 10.x | 开源、丰富图表 |

### 9.2 选型对比

#### **消息队列**: Kafka vs RabbitMQ vs Redis Streams

| 维度 | Kafka | RabbitMQ | Redis Streams |
|------|-------|----------|---------------|
| **吞吐量** | 极高（百万/秒） | 中等（万/秒） | 高（十万/秒） |
| **持久化** | 有 | 有 | 有 |
| **延迟** | ms 级 | ms 级 | ms 级 |
| **消息回放** | ✅ | ❌ | ✅ |
| **复杂度** | 高 | 中等 | 低 |
| **我们的选择** | ✅ | - | - |

**理由**: Agent 协作需要高吞吐、持久化和消息回放能力。

---

#### **向量数据库**: Milvus vs Pinecone vs Weaviate

| 维度 | Milvus | Pinecone | Weaviate |
|------|--------|----------|----------|
| **部署方式** | 自托管 | 托管服务 | 自托管/托管 |
| **性能** | 极高 | 高 | 高 |
| **扩展性** | 分布式 | 自动 | 分布式 |
| **成本** | 低（开源） | 高（付费） | 中等 |
| **社区** | 活跃 | - | 活跃 |
| **我们的选择** | ✅ | - | - |

**理由**: 自托管降低成本，分布式支持扩展，社区活跃便于维护。

---

#### **数据库**: PostgreSQL vs MySQL vs MongoDB

| 维度 | PostgreSQL | MySQL | MongoDB |
|------|-----------|-------|---------|
| **ACID** | ✅ | ✅ | 部分 |
| **JSON 支持** | ✅ 原生 | ✅ 有限 | ✅ 原生 |
| **全文检索** | ✅ | 有限 | ✅ |
| **扩展性** | 高 | 高 | 高 |
| **成熟度** | 极高 | 极高 | 高 |
| **我们的选择** | ✅ | - | - |

**理由**: 需要 ACID 事务、JSON 存储和全文检索，PostgreSQL 是最佳选择。

---

## 10. 扩展路线图

### 10.1 分阶段实施

```
Phase 1: MVP (0-3 月)
├── 目标: 支持 50 人使用
├── 功能:
│   ├── 单 Agent 执行
│   ├── 基础知识库
│   ├── 简单成本控制
│   └── 基本监控
├── 技术栈:
│   ├── PostgreSQL
│   ├── Redis
│   └── 单体架构
└── 预算: $3,000/月

Phase 2: 完善 (3-6 月)
├── 目标: 支持 200 人使用
├── 新增功能:
│   ├── 多 Agent 协作
│   ├── 知识版本控制
│   ├── 高级成本控制
│   ├── 完整审计日志
│   └── Grafana 仪表盘
├── 技术升级:
│   ├── 引入 Kafka
│   ├── 引入 Milvus
│   └── 微服务拆分
└── 预算: $8,000/月

Phase 3: 扩展 (6-12 月)
├── 目标: 支持 500+ 人使用
├── 新增功能:
│   ├── 多租户支持
│   ├── 高级权限控制
│   ├── 知识图谱
│   ├── AI 驱动的冲突解决
│   └── 自动化运维
├── 技术升级:
│   ├── Kubernetes 集群
│   ├── 多区域部署
│   └── 灾备方案
└── 预算: $15,000/月
```

### 10.2 扩展方向

| 方向 | 时间 | 说明 |
|------|------|------|
| **多租户** | 6-9 月 | 支持多个团队/公司使用 |
| **商业化** | 9-12 月 | 提供 SaaS 服务 |
| **开源** | 12+ 月 | 开源核心组件，建立社区 |
| **国际化** | 12+ 月 | 支持多语言 |
| **AI 增强** | 持续 | 更智能的知识管理和冲突解决 |

---

## 📝 附录

### A. 术语表

| 术语 | 说明 |
|------|------|
| **Agent** | AI 代理，能够自主执行任务的智能体 |
| **LCA** | Lowest Common Ancestor，最近公共祖先（算法题相关） |
| **RBAC** | Role-Based Access Control，基于角色的访问控制 |
| **ABAC** | Attribute-Based Access Control，基于属性的访问控制 |
| **RRF** | Reciprocal Rank Fusion，倒数排序融合 |
| **HPA** | Horizontal Pod Autoscaler，Kubernetes 水平扩展 |
| **RTO** | Recovery Time Objective，恢复时间目标 |
| **RPO** | Recovery Point Objective，恢复点目标 |

### B. 参考资源

1. [Milvus 官方文档](https://milvus.io/docs)
2. [Kafka 官方文档](https://kafka.apache.org/documentation/)
3. [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
4. [Kubernetes 官方文档](https://kubernetes.io/docs/)
5. [System Design Interview - Alex Xu](https://github.com/alex-xu-system/bytebytego-system-design)

---

**文档版本**: 1.0  
**创建日期**: 2026-05-24  
**作者**: Claude Code Interview System  
**用途**: 系统设计面试学习参考
