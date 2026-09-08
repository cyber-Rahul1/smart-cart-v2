import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase6BDispatch1788690855344 implements MigrationInterface {
    name = 'Phase6BDispatch1788690855344'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."delivery_offers_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "delivery_offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "deliveryId" uuid NOT NULL, "riderId" uuid NOT NULL, "status" "public"."delivery_offers_status_enum" NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "version" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_335377b132db63eaf2c373d04ba" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_UNIQUE_ACTIVE_OFFER" ON "delivery_offers"  ("deliveryId", "riderId") WHERE status = 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "dispatchAttempts" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TYPE "public"."deliveries_status_enum" RENAME TO "deliveries_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."deliveries_status_enum" AS ENUM('PENDING_DISPATCH', 'OFFERING', 'ASSIGNED', 'REASSIGNING', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING', 'DELIVERED', 'FAILED', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "deliveries" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "deliveries" ALTER COLUMN "status" TYPE "public"."deliveries_status_enum" USING "status"::"text"::"public"."deliveries_status_enum"`);
        await queryRunner.query(`ALTER TABLE "deliveries" ALTER COLUMN "status" SET DEFAULT 'PENDING_DISPATCH'`);
        await queryRunner.query(`DROP TYPE "public"."deliveries_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" ALTER COLUMN "version" DROP DEFAULT`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_UNIQUE_ACTIVE_DELIVERY_PER_RIDER" ON "deliveries"  ("riderId") WHERE status IN ('ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING')`);
        await queryRunner.query(`ALTER TABLE "delivery_offers" ADD CONSTRAINT "FK_92af7a08376501121846063bcbf" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery_offers" ADD CONSTRAINT "FK_f16ce0bd5a4183f68c7a4cc81af" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "delivery_offers" DROP CONSTRAINT "FK_f16ce0bd5a4183f68c7a4cc81af"`);
        await queryRunner.query(`ALTER TABLE "delivery_offers" DROP CONSTRAINT "FK_92af7a08376501121846063bcbf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_UNIQUE_ACTIVE_DELIVERY_PER_RIDER"`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" ALTER COLUMN "version" SET DEFAULT '1'`);
        await queryRunner.query(`CREATE TYPE "public"."deliveries_status_enum_old" AS ENUM('PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED')`);
        await queryRunner.query(`ALTER TABLE "deliveries" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "deliveries" ALTER COLUMN "status" TYPE "public"."deliveries_status_enum_old" USING "status"::"text"::"public"."deliveries_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "deliveries" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."deliveries_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."deliveries_status_enum_old" RENAME TO "deliveries_status_enum"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "dispatchAttempts"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_UNIQUE_ACTIVE_OFFER"`);
        await queryRunner.query(`DROP TABLE "delivery_offers"`);
        await queryRunner.query(`DROP TYPE "public"."delivery_offers_status_enum"`);
    }

}
