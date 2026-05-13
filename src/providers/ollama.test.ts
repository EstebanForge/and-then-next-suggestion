import { describe, it, expect } from 'vitest';
import { OllamaDialect } from './ollama';
import { ProviderProfile, CompletionContext } from './types';

describe('OllamaDialect', () => {
    const dialect = new OllamaDialect();
    
    const mockProfile: ProviderProfile = {
        id: 'ollama',
        name: 'Ollama',
        endpoint: 'http://localhost:11434/api/generate',
        provider: 'ollama',
        apiType: 'ollama',
        model: 'codellama'
    };

    const mockCtx: CompletionContext = {
        textBefore: 'function add(a, b) {',
        textAfter: '}',
        languageId: 'javascript',
        fileExtension: '.js',
        maxTokens: 50,
        temperature: 0.1
    };

    it('should use FIM format for known models (codellama)', () => {
        const { init } = dialect.prepareRequest(mockCtx, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(body.model).toBe('codellama');
        expect(body.prompt).toBe('<PRE>function add(a, b) {<MID>');
        expect(body.suffix).toBe('}');
        expect(body.stream).toBe(false);
        expect(body.options.num_predict).toBe(50);
    });

    it('should use chat-style fallback for unknown models', () => {
        const unknownProfile = { ...mockProfile, model: 'some-random-model' };
        const { init } = dialect.prepareRequest(mockCtx, unknownProfile);
        const body = JSON.parse(init.body as string);

        expect(body.prompt).toContain('<<BEFORE>>');
        expect(body.prompt).toContain('<<AFTER>>');
        expect(body.stream).toBe(false);
        expect(body.system).toContain('code completion engine');
    });

    it('should detect deepseek FIM format', () => {
        const deepseekProfile = { ...mockProfile, model: 'deepseek-coder-v2' };
        const { init } = dialect.prepareRequest(mockCtx, deepseekProfile);
        const body = JSON.parse(init.body as string);

        expect(body.prompt).toContain('<fim_prefix>');
        expect(body.prompt).toContain('<fim_middle>');
    });

    it('should parse response', () => {
        const result = dialect.parseResponse({ response: ' return a + b; ' });
        expect(result).toBe('return a + b;');
    });
});
