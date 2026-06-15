# Provider Implementation Guide

And Then Next Suggestion supports multiple provider formats out of the box and a "Custom" mode for everything else.

## Native Providers

### OpenAI (`openai`)
Uses the Chat Completions API format.
- **Messages**: System message defines the assistant role (includes `languageId` + `fileExtension`); User message contains `BEFORE CURSOR` / `AFTER CURSOR` / `OUTPUT` markers.
- **Stop Sequences**: ```` ``` ````, `<|end|>`, `\n\n\n`.
- **Thinking/Reasoning**: Gated on `supportsThinking` (auto-detected by model name: `o1`-`o9`, `deepseek-reasoner`, `deepseek-r1`). When supported, `disableThinking` (default `true`) sends `thinking: { type: 'disabled' }`; otherwise `reasoning_effort: 'high'` + `thinking: { type: 'enabled' }` (and `temperature` is dropped).

### Anthropic (`anthropic`)
Uses the Messages API format.
- **Structure**: Single user message containing context and instructions.

### Ollama (`ollama`)
Uses the Generate API format, supporting suffix for FIM (Fill-In-the-Middle).
- **Prompt**: `textBefore`
- **Suffix**: `textAfter`

## Custom Provider & Templating

The `custom` provider type allows users to define a `customBody` JSON string.

### Available Placeholders
- `{{before}}`: Escaped text before the cursor.
- `{{after}}`: Escaped text after the cursor.
- `{{model}}`: The model name from settings.
- `{{maxTokens}}`: Integer limit.
- `{{temperature}}`: Sampling float.

### Example FIM Template
For backends like vLLM or HuggingFace TGI:
```json
{
  "model": "{{model}}",
  "prompt": "<PRE> {{before}} <SUF> {{after}} <MID>",
  "max_tokens": {{maxTokens}},
  "stop": ["<END>"]
}
```

## Adding a New Native Provider

Providers are implemented as `Dialect` classes under `src/providers/`, **not** by editing `fetchSuggestion`. `fetchSuggestion` is provider-agnostic: it resolves the dialect via `DialectRegistry.get(profile.apiType)` and delegates request/response handling to it.

To add a new native provider (e.g., `google-vertex`):

1. Add the enum value to `apiType` in `src/providers/types.ts` (`ProviderProfile.apiType` union).
2. Create `src/providers/<name>.ts` extending `BaseDialect` (which gives you `prepareRequest`, header construction, and the shared `sanitize()` response cleaner for free). Implement `prepareBody()` and `parseResponse()`. Set `readonly type`.
3. Register it in `src/providers/registry.ts` (`DialectRegistry.register('google-vertex', new GoogleVertexDialect())`).
4. Add `src/providers/<name>.test.ts` covering request body shape and response parsing (mirror the existing dialect tests).
5. Update the `apiType` enum in the `package.json` `profiles` schema so the Profile Manager webview offers the new option.

Because `buildExplainRequest` / `parseExplainResponse` in `src/explain.ts` carry a compile-time `never` exhaustiveness guard on `apiType`, adding the enum value will produce a TypeScript error there until you handle it, ensuring the Explain command supports the new provider too.
