


基于您提供的 OpenAI 官方 API 概览文档以及业界标准，所谓**“OpenAI 兼容格式” (OpenAI-compatible format)** 通常指的是 OpenAI 的 **Chat Completions API (`/v1/chat/completions`)** 规范。

由于该格式结构清晰且功能完备，目前绝大多数开源大模型（如 Llama, DeepSeek, Qwen）以及第三方模型服务平台（如 vLLM, Ollama, Together AI, Groq 等）都默认实现了对这一 API 格式的兼容。

以下是标准的 OpenAI 兼容格式 LLM API 的完整结构说明（结合了官方最新文档中提及的 `gpt-5.5`、`o4-mini` 等新模型特性以及 `reasoning_effort` 等最新参数 [1.2]）：

### 1. HTTP 请求基础结构
*   **请求方法**: `POST`
*   **默认端点**: `https://api.openai.com/v1/chat/completions` （如果是第三方兼容 API，通常只需将前缀替换为该服务商的基础域名）
*   **请求头 (Headers)** [1.2]:
    ```http
    Content-Type: application/json
    Authorization: Bearer YOUR_API_KEY
    ```
    *注：根据官方文档，你还可以在 Header 中附带 `OpenAI-Organization`、`OpenAI-Project` 及自定义的 `X-Client-Request-Id` 以用于企业级多项目管理和请求链路追踪 [1.2]。*

### 2. 请求体 (Request Body JSON) 结构
发送给大模型的 JSON 数据通常包含以下核心字段：

```json
{
  "model": "gpt-4o", // 模型名称（必填项，如 gpt-5.5, o4-mini, deepseek-chat 等）
  "messages":[      // 对话历史（必填项）
    {
      "role": "system", // 角色分为：system(系统提示词), user(用户), assistant(助手), tool(工具返回结果)
      "content": "你是一个有用的AI助手。"
    },
    {
      "role": "user",
      "content": "请介绍一下你自己。"
      // content 也可以是数组，用于多模态输入（如同时传入文本和图片URL）
    }
  ],
  "temperature": 0.7, // 采样温度，控制输出的随机性 (0.0 - 2.0)
  "top_p": 1.0,       // 核采样参数，与 temperature 二选一使用
  "n": 1,             // 为该条请求生成的回复数量
  "stream": false,    // 是否以流式(SSE)返回。如果为 true，则像打字机一样逐块返回
  "max_completion_tokens": 1024, // 限制生成的最大 token 数量（较新的参数，取代旧的 max_tokens，特别适用于带内部思考逻辑的推理模型）
  "reasoning_effort": "medium",  // 针对推理模型（如 o4-mini）的思考力度设置（支持 low, medium, high） [1.2]
  "presence_penalty": 0.0,  // 存在惩罚（避免模型重复相同的话题）
  "frequency_penalty": 0.0, // 频率惩罚（避免模型重复使用相同的词汇）
  "response_format": { "type": "json_object" }, // 强制输出格式（可选 text, json_object 或针对结构化输出的 json_schema）
  "tools":[ // 供模型调用的函数/工具列表（Function Calling 功能）
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string" }
          },
          "required": ["location"]
        }
      }
    }
  ],
  "tool_choice": "auto" // 工具调用策略（支持 auto, none, 或强制要求模型调用特定函数）
}
```

### 3. 同步响应体 (Response JSON) 结构
当 `stream: false`（默认情况）时，API 会在模型完整生成完毕后，一次性返回如下 JSON 数据：

```json
{
  "id": "chatcmpl-123456789",    // 唯一的对话 ID
  "object": "chat.completion",   // 对象类型（同步请求固定为 chat.completion）
  "created": 1677652288,         // 创建时间（Unix时间戳）
  "model": "gpt-4o-2024-08-06",  // 实际使用的模型版本
  "system_fingerprint": "fp_44709d6fcb", // 系统指纹（用于在排查时得知后端模型权重或配置是否有微小变更）
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我是一个AI助手...",
        "tool_calls": []         // 如果模型决定调用某个外部工具，该字段会包含函数名及 JSON 格式的传入参数
      },
      "finish_reason": "stop"    // 结束原因：stop(正常输出完毕), length(达到长度限制), tool_calls(模型中断文字输出，准备调用工具) 等
    }
  ],
  "usage": { // Token 的开销统计（计费的重要依据）
    "prompt_tokens": 18,     // 输入的 Token 数
    "completion_tokens": 12, // 模型生成的 Token 数（若为推理模型，这里可能还包含内部不可见的思考 Token）
    "total_tokens": 30       // 总消耗量
  }
}
```

### 4. 流式响应体 (Streaming Response) 结构
当设置 `"stream": true` 时，服务端不会等到全部生成完再返回，而是通过 **SSE (Server-Sent Events)** 格式返回数据块（Chunks）。这一格式被广泛用来实现前端页面中“打字机”式的逐字渲染效果。

返回的原始数据文本流格式如下：
```text
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"你"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"好"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```
*核心特征：*
1. 对象类型变更为 `chat.completion.chunk`。
2. 数据承载在 `choices[0].delta` 中，这是一个增量内容（每次仅传一个或几个字）。
3. 只有当生成结束的那一个数据块中，`finish_reason` 才会从 `null` 变为明确的结束状态（如 `"stop"`）。
4. 无论如何，数据流会以一条特殊的 `data: [DONE]` 文本标识结束。

### 总结
之所以业界将这套结构作为**“通用兼容规范”**，是因为它优雅地通过 `messages` 列表统一了单轮/多轮对话的设计、通过 `content` 数组支持了多模态数据、并原生内置了工具调用（`tools`/`tool_calls`）以及结构化验证（`response_format`）等进阶场景的需求 [1.2]。
