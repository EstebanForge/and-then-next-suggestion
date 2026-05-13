import { describe, it, expect } from 'vitest';
import { CustomDialect } from './custom';
import { ProviderProfile, CompletionContext } from './types';

describe('CustomDialect', () => {
    const dialect = new CustomDialect();
    
    const mockProfile: ProviderProfile = {
        id: 'custom',
        name: 'Custom',
        endpoint: 'https://api.example.com/complete',
        provider: 'custom',
        apiType: 'custom',
        model: 'my-model',
        customBody: '{"p": {{before}}, "s": {{after}}, "m": {{model}}}'
    };

    const mockCtx: CompletionContext = {
        textBefore: 'prefix',
        textAfter: 'suffix',
        languageId: 'plaintext',
        fileExtension: '.txt',
        maxTokens: 100,
        temperature: 0.7
    };

    it('should correctly replace placeholders in customBody', () => {
        const { init } = dialect.prepareRequest(mockCtx, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(body.p).toBe('prefix');
        expect(body.s).toBe('suffix');
        expect(body.m).toBe('my-model');
    });

    it('should handle strings with special characters', () => {
        const ctxSpecial: CompletionContext = {
            ...mockCtx,
            textBefore: 'line1\nline2\t"quoted"\\backslash',
            textAfter: '</suffix>'
        };
        const { init } = dialect.prepareRequest(ctxSpecial, mockProfile);
        const body = JSON.parse(init.body as string);

        expect(body.p).toBe('line1\nline2\t"quoted"\\backslash');
        expect(body.s).toBe('</suffix>');
    });

    it('should replace all occurrences of same placeholder', () => {
        const profileDupe = { 
            ...mockProfile, 
            customBody: '{"a": {{before}}, "b": {{before}}}' 
        };
        const { init } = dialect.prepareRequest(mockCtx, profileDupe);
        const body = JSON.parse(init.body as string);

        expect(body.a).toBe('prefix');
        expect(body.b).toBe('prefix');
    });

    it('should fallback to OpenAI-like body if no customBody', () => {
        const profileNoBody = { ...mockProfile, customBody: '' };
        const { init } = dialect.prepareRequest(mockCtx, profileNoBody);
        const body = JSON.parse(init.body as string);

        expect(body.messages[0].content).toBe('prefix');
    });

    it('should throw error on invalid JSON', () => {
        const profileInvalid = { ...mockProfile, customBody: '{ invalid }' };
        expect(() => dialect.prepareRequest(mockCtx, profileInvalid)).toThrow('Invalid Custom JSON Body');
    });

    it('should replace {{languageId}} and {{fileExtension}} placeholders', () => {
        const profileWithExt = {
            ...mockProfile,
            customBody: '{"lang": {{languageId}}, "ext": {{fileExtension}}, "m": {{model}}}'
        };
        const { init } = dialect.prepareRequest(mockCtx, profileWithExt);
        const body = JSON.parse(init.body as string);

        expect(body.lang).toBe('plaintext');
        expect(body.ext).toBe('.txt');
        expect(body.m).toBe('my-model');
    });
});
