import { describe, it, expect } from 'vitest';
import { OpenAIDialect } from './openai';
import { ProviderProfile, CompletionContext } from './types';

describe('OpenAIDialect', () => {
    const dialect = new OpenAIDialect();
    
    const mockProfile: ProviderProfile = {
        id: 'test',
        name: 'Test',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        provider: 'openai',
        apiType: 'openai',
        model: 'gpt-4',
        disableThinking: true,
        supportsThinking: true
    };

    const mockCtx: CompletionContext = {
        textBefore: 'const x = ',
        textAfter: ';',
        languageId: 'typescript',
        fileExtension: '.ts',
        maxTokens: 500,
        temperature: 0.1
    };

    it('should correctly prepare a request with thinking disabled', () => {
        const { url, init } = dialect.prepareRequest(mockCtx, mockProfile, 'key-123');
        const body = JSON.parse(init.body as string);

        expect(url).toBe(mockProfile.endpoint);
        expect(init.headers).toMatchObject({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer key-123'
        });
        expect(body.model).toBe('gpt-4');
        expect(body.reasoning_effort).toBeUndefined();
        expect(body.thinking).toEqual({ type: 'disabled' });
        expect(body.max_tokens).toBe(500);
    });

    it('should correctly prepare a request with thinking enabled', () => {
        const profileWithThinking = { ...mockProfile, disableThinking: false };
        const { init } = dialect.prepareRequest(mockCtx, profileWithThinking, 'key-123');
        const body = JSON.parse(init.body as string);

        expect(body.model).toBe('gpt-4');
        expect(body.reasoning_effort).toBe('high');
        expect(body.thinking).toEqual({ type: 'enabled' });
        expect(body.temperature).toBeUndefined();
    });

    it('should use plain text prompt format', () => {
        const { init } = dialect.prepareRequest(mockCtx, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(body.messages[1].content).toContain('BEFORE CURSOR:');
        expect(body.messages[1].content).toContain('AFTER CURSOR:');
        expect(body.messages[1].content).toContain('OUTPUT:');
        expect(body.messages[1].content).toContain('const x = ');
        expect(body.messages[1].content).toContain(';');
    });

    it('should parse a valid response', () => {
        const mockResponse = {
            choices: [{
                message: { content: '10' }
            }]
        };
        const result = dialect.parseResponse(mockResponse);
        expect(result).toBe('10');
    });

    it('should return null if model burned tokens on reasoning', () => {
        const mockResponse = {
            choices: [{
                message: { content: '', reasoning_content: 'I am thinking...' }
            }]
        };
        const result = dialect.parseResponse(mockResponse);
        expect(result).toBeNull();
    });

    it('should strip prefix duplication from response', () => {
        const ctxWithPrefix: CompletionContext = {
            textBefore: '$current_slug = str_replace(',
            textAfter: ');',
            languageId: 'php',
            fileExtension: '.php',
            maxTokens: 500,
            temperature: 0.1
        };
        const mockResponse = {
            choices: [{
                message: {
                    content: '$current_slug = str_replace(\'-\', \' \', $current_slug);'
                }
            }]
        };
        const result = dialect.parseResponse(mockResponse, ctxWithPrefix);
        expect(result).toBe('\'-\', \' \', $current_slug');
    });

    it('should strip suffix overlap from response', () => {
        const ctxWithSuffix: CompletionContext = {
            textBefore: 'echo ',
            textAfter: ';',
            languageId: 'php',
            fileExtension: '.php',
            maxTokens: 500,
            temperature: 0.1
        };
        const mockResponse = {
            choices: [{
                message: { content: '"hello";' }
            }]
        };
        const result = dialect.parseResponse(mockResponse, ctxWithSuffix);
        expect(result).toBe('"hello"');
    });

    it('should strip <thinking> blocks from response', () => {
        const mockResponse = {
            choices: [{
                message: {
                    content: '<thinking>Let me analyze...</thinking>return a + b;'
                }
            }]
        };
        const result = dialect.parseResponse(mockResponse);
        expect(result).toBe('return a + b;');
    });

    it('should strip <think blocks without closing > (DeepSeek format)', () => {
        const mockResponse = {
            choices: [{
                message: {
                    content: '<think\nThe user wants a function...\n</think\n\nconst x = 1;'
                }
            }]
        };
        const result = dialect.parseResponse(mockResponse);
        expect(result).toBe('const x = 1;');
    });

    it('should strip <think blocks with closing >', () => {
        const mockResponse = {
            choices: [{
                message: {
                    content: '<think\nreasoning here\n</think\n>const y = 2;'
                }
            }]
        };
        const result = dialect.parseResponse(mockResponse);
        expect(result).toBe('const y = 2;');
    });

    it('should return null when response is only <thinking>', () => {
        const mockResponse = {
            choices: [{
                message: {
                    content: '<thinking>Just reasoning here, no code</thinking>'
                }
            }]
        };
        const result = dialect.parseResponse(mockResponse);
        expect(result).toBeNull();
    });

    it('should return null when response is only <think', () => {
        const mockResponse = {
            choices: [{
                message: {
                    content: '<think\nreasoning only\n</think\n>'
                }
            }]
        };
        const result = dialect.parseResponse(mockResponse);
        expect(result).toBeNull();
    });

    it('should include file extension in system prompt when present', () => {
        const { init } = dialect.prepareRequest(mockCtx, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(body.messages[0].content).toContain('typescript (.ts)');
    });

    it('should omit file extension from system prompt when empty', () => {
        const ctxNoExt: CompletionContext = {
            ...mockCtx,
            fileExtension: ''
        };
        const { init } = dialect.prepareRequest(ctxNoExt, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(body.messages[0].content).toContain('typescript.');
        expect(body.messages[0].content).not.toContain('typescript (');
    });
});
