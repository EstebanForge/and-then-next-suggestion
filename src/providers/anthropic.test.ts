import { describe, it, expect } from 'vitest';
import { AnthropicDialect } from './anthropic';
import { ProviderProfile, CompletionContext } from './types';

describe('AnthropicDialect', () => {
    const dialect = new AnthropicDialect();

    const mockProfile: ProviderProfile = {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.anthropic.com/v1/messages',
        provider: 'anthropic',
        apiType: 'anthropic',
        model: 'claude-sonnet-4-20250514'
    };

    const mockCtx: CompletionContext = {
        textBefore: 'function add(a, b) {',
        textAfter: '}',
        languageId: 'typescript',
        fileExtension: '.ts',
        maxTokens: 500,
        temperature: 0.1
    };

    it('should set anthropic-specific headers', () => {
        const { init } = dialect.prepareRequest(mockCtx, mockProfile, 'sk-ant-123');
        const headers = init.headers as Record<string, string>;

        expect(headers['anthropic-version']).toBe('2023-06-01');
        expect(headers['x-api-key']).toBe('sk-ant-123');
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('should omit x-api-key when no apiKey provided', () => {
        const { init } = dialect.prepareRequest(mockCtx, mockProfile);
        const headers = init.headers as Record<string, string>;

        expect(headers['x-api-key']).toBeUndefined();
    });

    it('should build correct body structure', () => {
        const { url, init } = dialect.prepareRequest(mockCtx, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(url).toBe(mockProfile.endpoint);
        expect(body.model).toBe('claude-sonnet-4-20250514');
        expect(body.max_tokens).toBe(500);
        expect(body.temperature).toBe(0.1);
        expect(body.stop_sequences).toEqual(['```', '\n\n\n']);
    });

    it('should include file extension in system prompt when present', () => {
        const { init } = dialect.prepareRequest(mockCtx, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(body.system).toContain('typescript (.ts)');
    });

    it('should omit file extension from system prompt when empty', () => {
        const ctxNoExt: CompletionContext = { ...mockCtx, fileExtension: '' };
        const { init } = dialect.prepareRequest(ctxNoExt, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(body.system).toContain('typescript.');
        expect(body.system).not.toContain('typescript (');
    });

    it('should use plain text prompt format', () => {
        const { init } = dialect.prepareRequest(mockCtx, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(body.messages[0].role).toBe('user');
        expect(body.messages[0].content).toContain('BEFORE CURSOR:');
        expect(body.messages[0].content).toContain('AFTER CURSOR:');
        expect(body.messages[0].content).toContain('OUTPUT:');
        expect(body.messages[0].content).toContain('function add(a, b) {');
        expect(body.messages[0].content).toContain('}');
    });

    it('should parse a valid response', () => {
        const mockResponse = {
            content: [{ text: ' return a + b;' }]
        };
        const result = dialect.parseResponse(mockResponse);
        expect(result).toBe('return a + b;');
    });

    it('should return null for empty response', () => {
        const mockResponse = {
            content: [{ text: '' }]
        };
        const result = dialect.parseResponse(mockResponse);
        expect(result).toBeNull();
    });

    it('should strip prefix overlap from response', () => {
        const ctxOverlap: CompletionContext = {
            textBefore: 'echo ',
            textAfter: ';',
            languageId: 'php',
            fileExtension: '.php',
            maxTokens: 500,
            temperature: 0.1
        };
        const mockResponse = {
            content: [{ text: 'echo "hello";' }]
        };
        const result = dialect.parseResponse(mockResponse, ctxOverlap);
        expect(result).toBe('"hello"');
    });
});
