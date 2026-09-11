import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 12B-8 Increment 1 — provider-independent payout foundation.
 *
 * Adds payout-processing support columns to settlement_instructions.
 * Strictly additive: all columns are nullable except retryCount, which is
 * NOT NULL with a safe default, so existing rows remain valid untouched.
 *
 * NOTE on down(): rollback drops these columns; any values stored in them
 * are intentionally destroyed (they did not exist before this migration).
 * All pre-existing business columns/data are untouched by both directions.
 */
export class Phase12B8PayoutFoundation1789100000000 implements MigrationInterface {
    name = 'Phase12B8PayoutFoundation1789100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlement_instructions" ADD "completedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" ADD "failedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" ADD "errorCode" character varying`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" ADD "errorDetails" jsonb`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" ADD "retryCount" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" ADD "lastAttemptAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" ADD "providerResponse" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlement_instructions" DROP COLUMN "providerResponse"`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" DROP COLUMN "lastAttemptAt"`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" DROP COLUMN "retryCount"`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" DROP COLUMN "errorDetails"`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" DROP COLUMN "errorCode"`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" DROP COLUMN "failedAt"`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" DROP COLUMN "completedAt"`);
    }
}