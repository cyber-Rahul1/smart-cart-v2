import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase7ShopkeeperOrders1788694937000 implements MigrationInterface {
  name = 'Phase7ShopkeeperOrders1788694937000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create outbox_events enum
    await queryRunner.query(`
      CREATE TYPE "public"."outbox_events_status_enum" AS ENUM('PENDING', 'PROCESSED', 'FAILED')
    `);

    // Create outbox_events table
    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "status" "public"."outbox_events_status_enum" NOT NULL DEFAULT 'PENDING',
        "idempotency_key" character varying,
        "error" character varying,
        "processedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_events" PRIMARY KEY ("id")
      )
    `);

    // Index for polling pending events
    await queryRunner.query(`
      CREATE INDEX "IDX_outbox_events_status_createdAt" ON "outbox_events" ("status", "createdAt")
    `);

    // Unique index for idempotency key (only when not null)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_outbox_events_idempotencyKey" ON "outbox_events" ("idempotency_key") WHERE idempotency_key IS NOT NULL
    `);

    // Composite index on orders table for shopkeeper order queries: (shopId, status, createdAt)
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_shopId_status_createdAt" ON "orders" ("shopId", "status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_shopId_status_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_outbox_events_idempotencyKey"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_outbox_events_status_createdAt"`);
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(`DROP TYPE "public"."outbox_events_status_enum"`);
  }
}
