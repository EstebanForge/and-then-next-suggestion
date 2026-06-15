import { describe, it, expect } from 'vitest';
import { statusToMessage } from './statusMessages';

describe('statusToMessage', () => {
    const profileName = 'DeepSeek v4 Flash';

    it('returns bad request message for 400', () => {
        const msg = statusToMessage(400, profileName);
        expect(msg).toContain('400');
        expect(msg).toContain('Bad Request');
        expect(msg).toContain('model name');
    });

    it('returns unauthorized message for 401', () => {
        const msg = statusToMessage(401, profileName);
        expect(msg).toContain('401');
        expect(msg).toContain('Unauthorized');
        expect(msg).toContain(profileName);
        expect(msg).toContain('Set API Key');
    });

    it('returns payment required message for 402', () => {
        const msg = statusToMessage(402, profileName);
        expect(msg).toContain('402');
        expect(msg).toContain('Payment');
        expect(msg).toContain('billing');
    });

    it('returns forbidden message for 403', () => {
        expect(statusToMessage(403, profileName)).toContain('Forbidden');
    });

    it('returns not-found message for 404', () => {
        const msg = statusToMessage(404, profileName);
        expect(msg).toContain('404');
        expect(msg).toContain('endpoint or model');
    });

    it('returns timeout message for 408', () => {
        const msg = statusToMessage(408, profileName);
        expect(msg).toContain('Timeout');
        expect(msg).toContain('Request Timeout');
    });

    it('returns invalid-request message for 422', () => {
        const msg = statusToMessage(422, profileName);
        expect(msg).toContain('422');
        expect(msg).toContain('rejected the payload');
    });

    it('returns rate-limit message for 429', () => {
        const msg = statusToMessage(429, profileName);
        expect(msg).toContain('429');
        expect(msg).toContain('Rate Limit');
        expect(msg).toContain('rate-limit floor');
    });

    it('returns server error for 5xx', () => {
        expect(statusToMessage(500, profileName)).toContain('Server Error');
        expect(statusToMessage(503, profileName)).toContain('Server Error');
    });

    it('returns generic message for unknown codes', () => {
        const msg = statusToMessage(418, profileName);
        expect(msg).toContain('418');
        expect(msg).toContain('API Error');
    });

    it('always includes the profile name for context', () => {
        for (const status of [400, 401, 404, 429, 500, 503, 418]) {
            expect(statusToMessage(status, profileName)).toContain(profileName);
        }
    });
});
