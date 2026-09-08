import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase8DeliveryFields1788703705010 implements MigrationInterface {
    name = 'Phase8DeliveryFields1788703705010'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_outbox_events_idempotencyKey"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_outbox_events_status_createdAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_orders_shopId_status_createdAt"`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "pickupOtpHashed" character varying`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "pickupOtpAttempts" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "pickupOtpExpiresAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "pickupVerificationLockedUntil" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "pickupSupportRequired" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "deliveryOtpAttempts" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "deliveryOtpExpiresAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "deliveryVerificationLockedUntil" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "deliverySupportRequired" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`CREATE TYPE "public"."deliveries_failurereason_enum" AS ENUM('CUSTOMER_UNAVAILABLE', 'INCORRECT_ADDRESS', 'CUSTOMER_REFUSED_DELIVERY', 'CUSTOMER_REFUSED_PAYMENT', 'VEHICLE_BREAKDOWN', 'SHOP_CLOSED_OR_UNAVAILABLE', 'ITEMS_DAMAGED')`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "failureReason" "public"."deliveries_failurereason_enum"`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "failureNotes" text`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "pickedUpAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "outForDeliveryAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "arrivingAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "deliveredAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2c2d48a04a2e5590b0e8f02ead" ON "outbox_events"  ("idempotency_key") WHERE idempotency_key IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_e10d0e4896a0f24c546f88b84f" ON "outbox_events"  ("status", "createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e10d0e4896a0f24c546f88b84f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2c2d48a04a2e5590b0e8f02ead"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "deliveredAt"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "arrivingAt"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "outForDeliveryAt"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "pickedUpAt"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "failureNotes"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "failureReason"`);
        await queryRunner.query(`DROP TYPE "public"."deliveries_failurereason_enum"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "deliverySupportRequired"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "deliveryVerificationLockedUntil"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "deliveryOtpExpiresAt"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "deliveryOtpAttempts"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "pickupSupportRequired"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "pickupVerificationLockedUntil"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "pickupOtpExpiresAt"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "pickupOtpAttempts"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "pickupOtpHashed"`);
        await queryRunner.query(`CREATE INDEX "IDX_orders_shopId_status_createdAt" ON "orders" USING btree ("shopId", "status", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_outbox_events_status_createdAt" ON "outbox_events" USING btree ("status", "createdAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_outbox_events_idempotencyKey" ON "outbox_events" USING btree ("idempotency_key") WHERE (idempotency_key IS NOT NULL)`);
    }

}
