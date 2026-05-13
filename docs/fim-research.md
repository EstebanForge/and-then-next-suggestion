# FIM (Fill-In-the-Middle) API Research

> Date: 2026-05-22
> Status: Research complete, implementation pending

## Executive Summary

Most LLM providers do **not** offer dedicated FIM APIs. Our current chat-style prompting (`BEFORE CURSOR:` / `AFTER CURSOR:` / `OUTPUT:`) is the correct default. FIM should be added as an optional `apiType: "fim"` dialect for the 4 providers that support it.

## Provider FIM Support Matrix

| Provider | FIM API? | Endpoint | Format | Notes |
|----------|----------|----------|--------|-------|
| **DeepSeek** | Yes | `base_url=/beta` then `/completions` | `prompt` + `suffix` fields | Beta. Max 4K output. Must use `https://api.deepseek.com/beta` as base URL. |
| **Mistral (Codestral)** | Yes | `/v1/fim/completions` | `prompt` + `suffix` fields | Production. Dedicated FIM endpoint. Auth: `Authorization: Bearer`. |
| **Qwen (Alibaba)** | Yes | `/compatible-mode/v1/completions` | FIM tokens in prompt string: `<\|fim_prefix\|>...<\|fim_suffix\|>...<\|fim_middle\|>` | Production. Uses legacy completions API. Tokens embedded in prompt, not separate fields. |
| **Google (Vertex AI)** | Yes | Vertex AI `code-gecko:predict` | `prefix` + `suffix` in instances | Legacy (Codey). Max 64 output tokens. GCP-only. Not viable for most users. |
| **Google (Gemini API)** | No | Chat only | N/A | No FIM on public Gemini API. |
| **OpenAI** | Partial | `/v1/completions` (legacy) | `prompt` + `suffix` | Only for `gpt-3.5-turbo-instruct` and `davinci-002`. No FIM for GPT-4o or o-series. Not viable. |
| **Anthropic** | No | Messages API only | N/A | No FIM endpoint. Completions API deprecated. Chat-only. |
| **MiniMax** | No | Chat completions only | N/A | OpenAI-compatible chat or Anthropic-compatible messages. No FIM. |
| **Z.AI (GLM)** | No | Chat completions only | N/A | OpenAI-compatible chat only. No FIM. |
| **OpenCode Go** | No | Proxy/aggregator | N/A | Routes to other providers. Inherits underlying provider limitations. No FIM of its own. |

## FIM Request Formats by Provider

### DeepSeek

```json
POST https://api.deepseek.com/beta/completions
{
  "model": "deepseek-v4-pro",
  "prompt": "def fib(a):",
  "suffix": "    return fib(a-1) + fib(a-2)",
  "max_tokens": 128
}
```

Response: `choices[0].text` (legacy completions format)

### Mistral (Codestral)

```json
POST https://api.mistral.ai/v1/fim/completions
{
  "model": "codestral-latest",
  "prompt": "def add(a, b):",
  "suffix": "return result",
  "max_tokens": 256,
  "temperature": 0.0
}
```

Response: `choices[0].message.content` (chat-like format despite being completions)

### Qwen

```json
POST https://dashscope.aliyuncs.com/compatible-mode/v1/completions
{
  "model": "qwen2.5-coder-32b-instruct",
  "prompt": "<|fim_prefix|>def quick_sort(arr):<|fim_suffix|>return sorted<|fim_middle|>",
  "max_tokens": 256
}
```

Response: `choices[0].text` (legacy completions format). FIM tokens are embedded in the prompt string itself.

## Implementation Plan

### 1. Add `fim` apiType to profile schema

In `package.json`, add `"fim"` to the `apiType` enum alongside `openai`, `anthropic`, `ollama`, `custom`.

### 2. Create `FimDialect` class

New file: `src/providers/fim.ts`

Responsibilities:
- Accept `prompt` (prefix) and `suffix` directly
- Auto-detect provider-specific FIM format from endpoint URL:
  - `api.deepseek.com` → DeepSeek format (legacy completions + suffix field)
  - `api.mistral.ai` → Mistral format (`/v1/fim/completions`)
  - `dashscope.aliyuncs.com` or Qwen endpoints → Qwen format (FIM tokens in prompt)
  - Default → OpenAI legacy completions format (prompt + suffix)
- Parse response from `choices[0].text` (legacy) or `choices[0].message.content` (Mistral)

### 3. Register in DialectRegistry

Add `FimDialect` to `src/providers/registry.ts`.

### 4. Configuration examples

```json
{
  "id": "deepseek-fim",
  "name": "DeepSeek FIM",
  "endpoint": "https://api.deepseek.com/beta/completions",
  "provider": "deepseek",
  "apiType": "fim",
  "model": "deepseek-v4-pro",
  "maxTokens": 4000,
  "temperature": 0.0
}
```

### 5. Key differences from chat dialect

- No system prompt (FIM is trained without instructions)
- No markers needed (FIM is the native format)
- Temperature should default to 0.0 for FIM
- Response uses `choices[0].text` not `choices[0].message.content` (except Mistral)

## Open Questions

- Should we auto-detect FIM capability from model name (e.g., models containing "coder", "codestral")?
- Should the existing `ollama` dialect's FIM support be merged into the new `fim` dialect?
- Should we support streaming for FIM (Mistral supports it)?

## References

- DeepSeek FIM docs: https://api-docs.deepseek.com/guides/fim_completion
- Mistral FIM API: https://docs.mistral.ai/api/endpoint/fim
- Qwen completions: https://www.alibabacloud.com/help/en/model-studio/completions
- Google code-gecko: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/code-completion
