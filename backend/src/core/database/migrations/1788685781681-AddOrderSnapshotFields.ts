import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderSnapshotFields1788685781681 implements MigrationInterface {
    name = 'AddOrderSnapshotFields1788685781681'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "idempotencyKey" character varying`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "subtotal" numeric(14,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "deliveryAddressLabel" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "deliveryAddressLine" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "deliveryLocation" geography(Point,4326) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "cancelledAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "cancellationReason" character varying`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_463446ea64e2ea8c5b29c0a3a2" ON "orders"  ("customerId", "idempotencyKey") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_463446ea64e2ea8c5b29c0a3a2"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "cancellationReason"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "cancelledAt"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "deliveryLocation"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "deliveryAddressLine"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "deliveryAddressLabel"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "subtotal"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "idempotencyKey"`);
    }

}
