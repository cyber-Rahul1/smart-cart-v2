import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentsAndWebhooks1788687770907 implements MigrationInterface {
    name = 'AddPaymentsAndWebhooks1788687770907'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."webhook_events_status_enum" AS ENUM('RECEIVED', 'VERIFIED', 'PROCESSED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider" character varying NOT NULL, "eventId" character varying NOT NULL, "status" "public"."webhook_events_status_enum" NOT NULL DEFAULT 'RECEIVED', "processedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4cba37e6a0acb5e1fc49c34ebfd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_98f2cff1929323fc1166e80938" ON "webhook_events"  ("provider", "eventId") `);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "UQ_eabdca3774d4f3a2ca17c9d1b0d"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "providerTransactionId"`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "currency" character varying NOT NULL DEFAULT 'INR'`);
        await queryRunner.query(`CREATE TYPE "public"."payments_paymentmethod_enum" AS ENUM('ONLINE', 'COD')`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "paymentMethod" "public"."payments_paymentmethod_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "providerOrderId" character varying`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "UQ_159e7c298446ff3e15c25b50919" UNIQUE ("providerOrderId")`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "providerPaymentId" character varying`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "UQ_50d2f08323fc3531369f2f41841" UNIQUE ("providerPaymentId")`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "idempotencyKey" character varying`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "requestPayloadHash" character varying`);
        await queryRunner.query(`ALTER TYPE "public"."payments_status_enum" RENAME TO "payments_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED')`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payments_status_enum" USING "status"::"text"::"public"."payments_status_enum"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'CREATED'`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum_old"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ddd78855b1cf0cfac6fb95f9ea" ON "payments"  ("orderId", "idempotencyKey") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_unique_successful_payment" ON "payments"  ("orderId") WHERE status IN ('AUTHORIZED', 'CAPTURED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_unique_successful_payment"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ddd78855b1cf0cfac6fb95f9ea"`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum_old" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payments_status_enum_old" USING "status"::"text"::"public"."payments_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."payments_status_enum_old" RENAME TO "payments_status_enum"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "requestPayloadHash"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "idempotencyKey"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "UQ_50d2f08323fc3531369f2f41841"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "providerPaymentId"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "UQ_159e7c298446ff3e15c25b50919"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "providerOrderId"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "paymentMethod"`);
        await queryRunner.query(`DROP TYPE "public"."payments_paymentmethod_enum"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "currency"`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "providerTransactionId" character varying`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "UQ_eabdca3774d4f3a2ca17c9d1b0d" UNIQUE ("providerTransactionId")`);
        await queryRunner.query(`DROP INDEX "public"."IDX_98f2cff1929323fc1166e80938"`);
        await queryRunner.query(`DROP TABLE "webhook_events"`);
        await queryRunner.query(`DROP TYPE "public"."webhook_events_status_enum"`);
    }

}
