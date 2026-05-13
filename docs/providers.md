# Provider Implementation Guide

And Then Next Suggestion supports multiple provider formats out of the box and a "Custom" mode for everything else.

## Native Providers

### OpenAI (`openai`)
Uses the Chat Completions API format.
- **Messages**: System message defines the assistant role, User message contains `before` and `after` context.
- **Stop Sequences**: Defaulted to `\n\n` and ` ``` ` to prevent rambling.

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

To add a new native provider (e.g., `google-vertex`):
1. Add the enum value to `nextSuggestion.provider` in `package.json`.
2. Update the `fetchSuggestion` function in `src/extension.ts` to handle the new provider type in the `body` construction and `data` parsing logic.
