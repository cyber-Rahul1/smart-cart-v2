import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYOUT_PROVIDER_ENV, PAYOUT_PROVIDER_NONE, PAYOUT_PROVIDER_STUB } from '../constants/payout.constants.js';
import { IPayoutProvider } from '../interfaces/payout-provider.interface.js';
import { DisabledPayoutProvider } from './disabled.payout.provider.js';
import { StubPayoutProvider } from './stub.payout.provider.js';

/**
 * Resolves the payout provider implementation from configuration.
 *
 * Safety semantics:
 * - 'none'  -> DisabledPayoutProvider (every operation throws). Default in
 *             production/staging until a real provider is selected.
 * - 'stub'  -> StubPayoutProvider. Rejected by env validation in
 *             production/staging; the stub additionally refuses to
 *             instantiate if NODE_ENV is 'production' (belt-and-braces).
 * - unset   -> mirrors env-validation defaults: 'none' in production/staging,
 *              'stub' elsewhere. Production always fails safe (disabled).
 * - unknown -> throws at resolution time (fail-fast at boot).
 *
 * When a real provider is selected in the future, extend this factory (and
 * the Joi env validation) with the new provider name — no domain changes.
 */
@Injectable()
export class PayoutProviderFactory {
    private readonly logger = new Logger(PayoutProviderFactory.name);

    constructor(private readonly configService: ConfigService) { }

    resolve(): IPayoutProvider {
        const rawConfig = this.configService.get<string>(PAYOUT_PROVIDER_ENV);
        const configured = rawConfig || this.defaultForEnvironment();

        switch (configured) {
            case PAYOUT_PROVIDER_NONE:
                this.logger.warn('Payout processing is DISABLED (PAYOUT_PROVIDER="none").');
                return new DisabledPayoutProvider();
            case PAYOUT_PROVIDER_STUB:
                // StubPayoutProvider itself refuses instantiation in production.
                return new StubPayoutProvider();
            default:
                throw new Error(
                    `Unsupported PAYOUT_PROVIDER value: "${configured}". ` +
                    'Supported values: "none", "stub" (non-production only). ' +
                    'Real providers become available once a payout provider is selected (see docs/DECISIONS.md).',
                );
        }
    }

    /**
     * Mirrors the Joi env-validation defaults for callers that do not apply
     * the validation schema (e.g. tests importing FinancialsModule directly):
     * unset -> "none" in production/staging, "stub" otherwise. Production
     * always fails safe (payouts disabled) when nothing is configured.
     */
    private defaultForEnvironment(): string {
        const nodeEnv = process.env.NODE_ENV ?? 'development';
        return nodeEnv === 'production' || nodeEnv === 'staging'
            ? PAYOUT_PROVIDER_NONE
            : PAYOUT_PROVIDER_STUB;
    }
}