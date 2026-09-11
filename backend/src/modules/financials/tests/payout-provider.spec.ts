import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PayoutDispatchStatus } from '../enums/payout-dispatch-status.enum.js';
import { PayoutProviderStatus } from '../enums/payout-provider-status.enum.js';
import {
    buildPayoutIdempotencyKey,
    PAYOUT_PROVIDER_ENV,
} from '../constants/payout.constants.js';
import { PayoutDispatchRequest } from '../interfaces/payout-provider.interface.js';
import { StubPayoutProvider, StubPayoutMode } from '../providers/stub.payout.provider.js';
import {
    DisabledPayoutProvider,
    PayoutProviderNotConfiguredException,
} from '../providers/disabled.payout.provider.js';
import { PayoutProviderFactory } from '../providers/payout-provider.factory.js';

function makeRequest(key: string): PayoutDispatchRequest {
    return {
        providerIdempotencyKey: key,
        amountInMinorUnits: 10000,
        currency: 'INR',
        beneficiaryRef: 'beneficiary-1',
        narration: 'settlement-order-order-1',
    };
}

describe('Payout idempotency key', () => {
    it('is deterministic: payout-<instructionId>', () => {
        expect(buildPayoutIdempotencyKey('abc-123')).toBe('payout-abc-123');
    });

    it('returns the same key on repeated calls (stable across retries)', () => {
        const a = buildPayoutIdempotencyKey('instr-1');
        const b = buildPayoutIdempotencyKey('instr-1');
        expect(a).toBe(b);
    });

    it('produces distinct keys per instruction', () => {
        expect(buildPayoutIdempotencyKey('instr-1')).not.toBe(buildPayoutIdempotencyKey('instr-2'));
    });
});

describe('StubPayoutProvider (simulated only — never real money)', () => {
    beforeEach(() => {
        vi.stubEnv('NODE_ENV', 'test');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('simulates ACCEPTED with a stub_transfer_ id and simulated metadata', async () => {
        const provider = new StubPayoutProvider({ defaultMode: StubPayoutMode.ACCEPTED });
        const result = await provider.dispatchPayout(makeRequest('payout-i1'));
        expect(result.status).toBe(PayoutDispatchStatus.ACCEPTED);
        expect(result.providerTransferId).toMatch(/^stub_transfer_/);
        expect(result.errorCode).toBeNull();
        expect(result.errorDetails).toEqual({ simulated: true });
    });

    it('simulates PROCESSING', async () => {
        const provider = new StubPayoutProvider({ defaultMode: StubPayoutMode.PROCESSING });
        const result = await provider.dispatchPayout(makeRequest('payout-i2'));
        expect(result.status).toBe(PayoutDispatchStatus.PROCESSING);
        expect(result.providerTransferId).toMatch(/^stub_transfer_/);
    });

    it('simulates FAILED (definitive rejection, no transfer id)', async () => {
        const provider = new StubPayoutProvider({ defaultMode: StubPayoutMode.FAILED });
        const result = await provider.dispatchPayout(makeRequest('payout-i3'));
        expect(result.status).toBe(PayoutDispatchStatus.FAILED);
        expect(result.providerTransferId).toBeNull();
        expect(result.errorCode).toBe('STUB_REJECTED');
    });

    it('simulates UNKNOWN (ambiguous outcome)', async () => {
        const provider = new StubPayoutProvider({ defaultMode: StubPayoutMode.UNKNOWN });
        const result = await provider.dispatchPayout(makeRequest('payout-i4'));
        expect(result.status).toBe(PayoutDispatchStatus.UNKNOWN);
        expect(result.providerTransferId).toBeNull();
        expect(result.errorCode).toBe('STUB_TIMEOUT');
    });

    it('supports per-key scripted modes falling back to the default', async () => {
        const provider = new StubPayoutProvider({
            defaultMode: StubPayoutMode.ACCEPTED,
            scriptedModes: { 'payout-special': StubPayoutMode.UNKNOWN },
        });
        const scripted = await provider.dispatchPayout(makeRequest('payout-special'));
        const fallback = await provider.dispatchPayout(makeRequest('payout-other'));
        expect(scripted.status).toBe(PayoutDispatchStatus.UNKNOWN);
        expect(fallback.status).toBe(PayoutDispatchStatus.ACCEPTED);
    });

    it('getPayoutStatus returns scripted status, NOT_FOUND for unknown ids', async () => {
        const provider = new StubPayoutProvider({ defaultMode: StubPayoutMode.PROCESSING });
        await provider.dispatchPayout(makeRequest('payout-i5'));
        const known = await provider.getPayoutStatus(`stub_transfer_payout-i5`);
        const unknown = await provider.getPayoutStatus('stub_transfer_never-seen');
        expect(known.status).toBe(PayoutProviderStatus.PROCESSING);
        expect(unknown.status).toBe(PayoutProviderStatus.NOT_FOUND);
    });

    it('refuses to verify webhooks and refuses to parse webhook events', () => {
        const provider = new StubPayoutProvider();
        expect(provider.verifyWebhook('sig', Buffer.from('body'))).toBe(false);
        expect(() => provider.parseWebhookEvent({})).toThrow();
    });

    it('refuses to instantiate in production', () => {
        vi.stubEnv('NODE_ENV', 'production');
        expect(() => new StubPayoutProvider()).toThrow(/forbidden in production/i);
    });

    it('performs no network I/O (dispatch is a pure in-memory simulation)', async () => {
        // Global fetch spy: any network attempt by the stub fails the test.
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const provider = new StubPayoutProvider();
        await provider.dispatchPayout(makeRequest('payout-noio'));
        expect(fetchSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});

describe('DisabledPayoutProvider (payouts disabled)', () => {
    it('throws PayoutProviderNotConfiguredException on dispatch', async () => {
        const provider = new DisabledPayoutProvider();
        await expect(provider.dispatchPayout(makeRequest('payout-x'))).rejects.toThrow(
            PayoutProviderNotConfiguredException,
        );
    });

    it('throws on status query and webhook parsing; never verifies webhooks', async () => {
        const provider = new DisabledPayoutProvider();
        await expect(provider.getPayoutStatus('t1')).rejects.toThrow(PayoutProviderNotConfiguredException);
        expect(provider.verifyWebhook('sig', Buffer.from('b'))).toBe(false);
        expect(() => provider.parseWebhookEvent({})).toThrow(PayoutProviderNotConfiguredException);
    });
});

describe('PayoutProviderFactory (configuration)', () => {
    function factoryWith(payoutProvider: string | undefined): PayoutProviderFactory {
        const config = new ConfigService({ [PAYOUT_PROVIDER_ENV]: payoutProvider });
        return new PayoutProviderFactory(config);
    }

    it('resolves "none" to DisabledPayoutProvider', () => {
        const provider = factoryWith('none').resolve();
        expect(provider).toBeInstanceOf(DisabledPayoutProvider);
    });

    it('resolves "stub" to StubPayoutProvider in non-production', () => {
        vi.stubEnv('NODE_ENV', 'test');
        const provider = factoryWith('stub').resolve();
        expect(provider).toBeInstanceOf(StubPayoutProvider);
        vi.unstubAllEnvs();
    });

    it('throws for unsupported provider names (fail-fast at boot)', () => {
        expect(() => factoryWith('razorpayx').resolve()).toThrow(/Unsupported PAYOUT_PROVIDER/i);
    });

    it('falls back to environment defaults when unset (Joi mirror)', () => {
        vi.stubEnv('NODE_ENV', 'test');
        const provider = factoryWith(undefined).resolve();
        expect(provider).toBeInstanceOf(StubPayoutProvider);
        vi.unstubAllEnvs();
    });
});

describe('Env validation (PAYOUT_PROVIDER production safety)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('defaults to stub in non-production and rejects "stub" in production', async () => {
        const { envValidationSchema } = await import('../../../core/config/env.validation.js');
        const base = {
            NODE_ENV: 'production',
            POSTGRES_HOST: 'h', POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'p', POSTGRES_DB: 'd',
            REDIS_HOST: 'r', JWT_SECRET: 'j', JWT_EXPIRATION: '1h', JWT_REFRESH_EXPIRATION: '2h',
            TWILIO_ACCOUNT_SID: 'AC12345678901234567890123456789012',
            TWILIO_AUTH_TOKEN: 't', TWILIO_VERIFY_SERVICE_SID: 'VA12345678901234567890123456789012',
            RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's', RAZORPAY_WEBHOOK_SECRET: 'w',
            GOOGLE_MAPS_API_KEY: 'g', CLOUDINARY_URL: 'c',
            PUSH_PROVIDER: 'fcm', GOOGLE_APPLICATION_CREDENTIALS: 'gac',
        };

        const prodStub = envValidationSchema.validate({ ...base, PAYOUT_PROVIDER: 'stub' });
        expect(prodStub.error).toBeDefined();

        const prodDefault = envValidationSchema.validate(base);
        expect(prodDefault.error).toBeUndefined();
        expect(prodDefault.value.PAYOUT_PROVIDER).toBe('none');

        const devDefault = envValidationSchema.validate({ ...base, NODE_ENV: 'development' });
        expect(devDefault.error).toBeUndefined();
        expect(devDefault.value.PAYOUT_PROVIDER).toBe('stub');

        const devInvalid = envValidationSchema.validate({ ...base, NODE_ENV: 'development', PAYOUT_PROVIDER: 'stripe' });
        expect(devInvalid.error).toBeDefined();
    });
});