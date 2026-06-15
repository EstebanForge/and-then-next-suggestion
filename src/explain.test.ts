import { describe, it, expect } from 'vitest';
import { buildExplainRequest, parseExplainResponse } from './explain';
import { ProviderProfile } from './providers/types';

describe('explain', () => {
    const code = 'const square = (n) => n * n;';

    describe('buildExplainRequest (openai)', () => {
        const profile: ProviderProfile = {
            id: 'test', name: 'Test', endpoint: 'https://api.deepseek.com/v1/chat/completions',
            provider: 'deepseek', apiType: 'openai', model: 'deepseek-v4-flash', maxTokens: 1500
        };

        it('targets the profile endpoint with Bearer auth', () => {
            const { url, init } = buildExplainRequest(profile, 'sk-test-key', code);
            expect(url).toBe(profile.endpoint);
            expect(init.headers).toMatchObject({
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk-test-key'
            });
        });

        it('builds a chat request with system + user messages containing the code', () => {
            const { init } = buildExplainRequest(profile, 'key', code);
            const body = JSON.parse(init.body as string);
            expect(body.messages).toHaveLength(2);
            expect(body.messages[0].role).toBe('system');
            expect(body.messages[1].role).toBe('user');
            expect(body.messages[1].content).toContain(code);
            expect(body.model).toBe('deepseek-v4-flash');
            expect(body.max_tokens).toBe(1500);
            expect(body.temperature).toBe(0.3);
        });

        it('omits Authorization header when no apiKey is provided', () => {
            const { init } = buildExplainRequest(profile, undefined, code);
            expect(init.headers).not.toHaveProperty('Authorization');
        });
    });

    describe('buildExplainRequest (anthropic)', () => {
        const profile: ProviderProfile = {
            id: 'anth', name: 'Anthropic', endpoint: 'https://api.anthropic.com/v1/messages',
            provider: 'anthropic', apiType: 'anthropic', model: 'claude-3-5-sonnet'
        };

        it('uses x-api-key header and anthropic-version', () => {
            const { init } = buildExplainRequest(profile, 'ant-key', code);
            expect(init.headers).toMatchObject({
                'anthropic-version': '2023-06-01',
                'x-api-key': 'ant-key'
            });
            const body = JSON.parse(init.body as string);
            expect(body.system).toBeTruthy();
            expect(body.messages[0].content).toContain(code);
            expect(body.stop_sequences).toBeUndefined();
        });
    });

    describe('buildExplainRequest (ollama)', () => {
        const profile: ProviderProfile = {
            id: 'oll', name: 'Ollama', endpoint: 'http://localhost:11434/api/generate',
            provider: 'ollama', apiType: 'ollama', model: 'qwen2.5-coder:7b'
        };

        it('builds a prompt + system body with stream disabled', () => {
            const { init } = buildExplainRequest(profile, undefined, code);
            const body = JSON.parse(init.body as string);
            expect(body.model).toBe('qwen2.5-coder:7b');
            expect(body.prompt).toContain(code);
            expect(body.system).toBeTruthy();
            expect(body.stream).toBe(false);
            expect(body.options.num_predict).toBe(2000);
        });
    });

    describe('buildExplainRequest (custom)', () => {
        const profile: ProviderProfile = {
            id: 'cus', name: 'Custom', endpoint: 'https://custom.example.com/v1/chat',
            provider: 'custom', apiType: 'custom', model: 'my-model'
        };

        it('falls back to OpenAI-compatible chat format', () => {
            const { init } = buildExplainRequest(profile, 'key', code);
            const body = JSON.parse(init.body as string);
            expect(body.messages[0].role).toBe('system');
            expect(body.messages[1].content).toContain(code);
        });

        it('uses default maxTokens (2000) when profile omits it', () => {
            const noMaxProfile: ProviderProfile = {
                id: 'cus2', name: 'Custom2', endpoint: 'https://custom.example.com/v1/chat',
                provider: 'custom', apiType: 'custom', model: 'my-model'
            };
            const { init } = buildExplainRequest(noMaxProfile, undefined, code);
            const body = JSON.parse(init.body as string);
            expect(body.max_tokens).toBe(2000);
        });
    });

    describe('parseExplainResponse', () => {
        it('parses openai-style choices', () => {
            const data = { choices: [{ message: { content: 'This function squares a number.' } }] };
            expect(parseExplainResponse('openai', data)).toBe('This function squares a number.');
        });

        it('parses openai legacy text field', () => {
            const data = { choices: [{ text: 'Legacy response.' }] };
            expect(parseExplainResponse('openai', data)).toBe('Legacy response.');
        });

        it('parses anthropic-style content blocks', () => {
            const data = { content: [{ text: 'Anthropic explanation.' }] };
            expect(parseExplainResponse('anthropic', data)).toBe('Anthropic explanation.');
        });

        it('parses ollama-style response field', () => {
            const data = { response: 'Ollama explanation.' };
            expect(parseExplainResponse('ollama', data)).toBe('Ollama explanation.');
        });

        it('returns null for empty/missing content', () => {
            expect(parseExplainResponse('openai', { choices: [] })).toBeNull();
            expect(parseExplainResponse('anthropic', { content: [] })).toBeNull();
            expect(parseExplainResponse('ollama', {})).toBeNull();
        });
    });
});
