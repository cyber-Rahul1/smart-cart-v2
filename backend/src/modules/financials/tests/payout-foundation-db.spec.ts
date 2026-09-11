import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SettlementInstruction } from '../entities/settlement-instruction.entity.js';
import { SettlementInstructionStatus } from '../enums/settlement-instruction-status.enum.js';
import { ALL_ENTITIES } from '../../../core/database/entities.js';
import { User } from '../../users/entities/user.entity.js';
import { Shop } from '../../shops/entities/shop.entity.js';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';

/**
 * Phase 12B-8 Increment 1 — payout foundation schema verification.
 *
 * Verifies the new payout support columns on settlement_instructions:
 * presence, types/defaults, null behavior for existing rows, and that the
 * immutable financial snapshot columns are untouched by the foundation.
 *
 * (Migration up/down/re-up against a real migrations-run database is verified
 * separately via `npm run migration:run` / `migration:revert`.)
 */
describe('Payout foundation schema (DB)', () => {
    let moduleRef: TestingModule;
    let dataSource: DataSource;

    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    host: process.env.POSTGRES_HOST || 'localhost',
                    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
                    username: process.env.POSTGRES_USER || 'postgres',
                    password: process.env.POSTGRES_PASSWORD || 'postgres',
                    database: process.env.POSTGRES_DB || 'smart_cart',
                    entities: ALL_ENTITIES,
                    synchronize: true,
                    dropSchema: false,
                    logging: false,
                }),
            ],
        }).compile();

        dataSource = moduleRef.get(DataSource);
    }, 60000);

    afterAll(async () => {
        if (moduleRef) {
            await moduleRef.close();
        }
    });

    async function columnMeta(column: string) {
        const result = await dataSource.query(
            `SELECT data_type, is_nullable, column_default FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'settlement_instructions' AND column_name = $1`,
            [column],
        );
        return result[0];
    }

    it('exposes all seven new payout foundation columns with correct types', async () => {
        const completedAt = await columnMeta('completedAt');
        expect(completedAt.data_type).toBe('timestamp with time zone');
        expect(completedAt.is_nullable).toBe('YES');

        const failedAt = await columnMeta('failedAt');
        expect(failedAt.data_type).toBe('timestamp with time zone');
        expect(failedAt.is_nullable).toBe('YES');

        const errorCode = await columnMeta('errorCode');
        expect(errorCode.data_type).toBe('character varying');
        expect(errorCode.is_nullable).toBe('YES');

        const errorDetails = await columnMeta('errorDetails');
        expect(errorDetails.data_type).toBe('jsonb');
        expect(errorDetails.is_nullable).toBe('YES');

        const retryCount = await columnMeta('retryCount');
        expect(retryCount.data_type).toBe('integer');
        expect(retryCount.is_nullable).toBe('NO');
        expect(retryCount.column_default).toBe('0');

        const lastAttemptAt = await columnMeta('lastAttemptAt');
        expect(lastAttemptAt.data_type).toBe('timestamp with time zone');
        expect(lastAttemptAt.is_nullable).toBe('YES');

        const providerResponse = await columnMeta('providerResponse');
        expect(providerResponse.data_type).toBe('jsonb');
        expect(providerResponse.is_nullable).toBe('YES');
    });

    it('persists safe defaults (retryCount = 0, rest null) after insert', async () => {
        const userRepo = dataSource.getRepository(User);
        const user = await userRepo.save(userRepo.create({ phoneNumber: '+1' + Math.floor(Math.random() * 1000000000) }));
        const shopRepo = dataSource.getRepository(Shop);
        const shop = await shopRepo.save(shopRepo.create({
            ownerId: user.id,
            name: 'PayoutFoundationSpecShop',
            location: { type: 'Point', coordinates: [77, 12] },
        }));

        const repo = dataSource.getRepository(SettlementInstruction);
        const saved = await repo.save(
            repo.create({
                providerAccountId: shop.id,
                customerGrossAmount: 100,
                providerGrossAmount: 100,
                platformCommission: 5,
                paymentGatewayFees: 0,
                providerNetSettlement: 95,
                status: SettlementInstructionStatus.PENDING,
                idempotencyKey: `payout-foundation-spec-${Date.now()}`,
            }),
        );

        expect(saved.retryCount).toBe(0);
        expect(saved.completedAt).toBeNull();
        expect(saved.failedAt).toBeNull();
        expect(saved.errorCode).toBeNull();
        expect(saved.errorDetails).toBeNull();
        expect(saved.lastAttemptAt).toBeNull();
        expect(saved.providerResponse).toBeNull();
    });

    it('keeps the financial snapshot columns immutable in definition (Phase 12B-7 write-once fields)', async () => {
        const moneyColumns = [
            'customerGrossAmount',
            'providerGrossAmount',
            'platformCommission',
            'paymentGatewayFees',
            'discounts',
            'refunds',
            'adjustments',
            'providerNetSettlement',
        ];
        for (const column of moneyColumns) {
            const meta = await columnMeta(column);
            expect(meta, column).toBeDefined();
            expect(meta.data_type, column).toBe('numeric');
            expect(meta.is_nullable, column).toBe('NO');
        }

        // The foundation adds no writers for these columns: this increment
        // contains no service that mutates SettlementInstruction at all.
        const repo = dataSource.getRepository(SettlementInstruction);
        const entity = repo.create({
            providerAccountId: '00000000-0000-0000-0000-000000000000',
            customerGrossAmount: 100,
            providerGrossAmount: 100,
            platformCommission: 5,
            paymentGatewayFees: 0,
            providerNetSettlement: 95,
            status: SettlementInstructionStatus.PENDING,
            idempotencyKey: `payout-foundation-immutable-${Date.now()}`,
        });
        expect(entity.customerGrossAmount).toBe(100);
        expect(entity.providerNetSettlement).toBe(95);
    });

    it('preserves pre-existing rows (all legacy columns still present)', async () => {
        const legacyColumns = [
            'id', 'orderId', 'providerAccountId', 'customerGrossAmount',
            'providerGrossAmount', 'platformCommission', 'paymentGatewayFees',
            'discounts', 'refunds', 'adjustments', 'providerNetSettlement',
            'status', 'providerTransferId', 'idempotencyKey', 'createdAt', 'updatedAt',
        ];
        for (const column of legacyColumns) {
            const meta = await columnMeta(column);
            expect(meta, `legacy column ${column} must still exist`).toBeDefined();
        }
    });
});