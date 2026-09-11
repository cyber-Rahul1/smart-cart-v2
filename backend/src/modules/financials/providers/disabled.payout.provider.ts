import { Injectable } from '@nestjs/common';
import {
    IPayoutProvider,
    ParsedPayoutWebhookEvent,
    PayoutDispatchRequest,
    PayoutDispatchResult,
    PayoutStatusResult,
} from '../interfaces/payout-provider.interface.js';

/**
 * Thrown by the DisabledPayoutProvider on any attempted payout operation.
 * Signals that no payout provider has been configured/selected yet.
 */
export class PayoutProviderNotConfiguredException extends Error {
    constructor() {
        super(
            'No payout provider is configured (PAYOUT_PROVIDER="none"). ' +
            'Payout processing is disabled until a provider is selected. ' +
            'See docs/DECISIONS.md (Payout Provider Selection Blocker).',
        );
        this.name = 'PayoutProviderNotConfiguredException';
    }
}

/**
 * Production-safe "payouts disabled" provider.
 *
 * Resolved when PAYOUT_PROVIDER="none" (the default in production/staging
 * until a real provider is selected). Every operation throws immediately —
 * it is structurally impossible to move money through this provider.
 */
@Injectable()
export class DisabledPayoutProvider implements IPayoutProvider {
    dispatchPayout(_req: PayoutDispatchRequest): Promise<PayoutDispatchResult> {
        return Promise.reject(new PayoutProviderNotConfiguredException());
    }

    getPayoutStatus(_providerTransferId: string): Promise<PayoutStatusResult> {
        return Promise.reject(new PayoutProviderNotConfiguredException());
    }

    verifyWebhook(_headers: Record<string, string | string[] | undefined>, _rawBody: Buffer): boolean {
        return false;
    }

    parseWebhookEvent(_payload: unknown): ParsedPayoutWebhookEvent {
        throw new PayoutProviderNotConfiguredException();
    }
}