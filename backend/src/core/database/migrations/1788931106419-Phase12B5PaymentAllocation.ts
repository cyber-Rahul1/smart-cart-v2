import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase12B5PaymentAllocation1788931106419 implements MigrationInterface {
    name = 'Phase12B5PaymentAllocation1788931106419'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" ADD "allocationId" uuid`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" ADD "orderId" uuid`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" ADD CONSTRAINT "UQ_0aaacbf1c75639fe81a58f5f1d6" UNIQUE ("orderId")`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" ADD "deliveryAddressLabel" character varying`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" ADD "deliveryAddressLine" character varying`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" ADD "deliveryLocation" geography(Point,4326)`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ddd78855b1cf0cfac6fb95f9ea"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "orderId" DROP NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ddd78855b1cf0cfac6fb95f9ea" ON "payments"  ("orderId", "idempotencyKey") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_unique_successful_alloc_payment" ON "payments"  ("allocationId") WHERE status IN ('AUTHORIZED', 'CAPTURED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED')`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "CHK_payment_target" CHECK ("orderId" IS NOT NULL OR "allocationId" IS NOT NULL)`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_4c37065f2378b7f3bafdac6f132" FOREIGN KEY ("allocationId") REFERENCES "meal_allocations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" ADD CONSTRAINT "FK_0aaacbf1c75639fe81a58f5f1d6" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "meal_allocations" DROP CONSTRAINT "FK_0aaacbf1c75639fe81a58f5f1d6"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_4c37065f2378b7f3bafdac6f132"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "CHK_payment_target"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_unique_successful_alloc_payment"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ddd78855b1cf0cfac6fb95f9ea"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "orderId" SET NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ddd78855b1cf0cfac6fb95f9ea" ON "payments" USING btree ("orderId", "idempotencyKey") `);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" DROP COLUMN "deliveryLocation"`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" DROP COLUMN "deliveryAddressLine"`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" DROP COLUMN "deliveryAddressLabel"`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" DROP CONSTRAINT "UQ_0aaacbf1c75639fe81a58f5f1d6"`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" DROP COLUMN "orderId"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "allocationId"`);
    }

}
