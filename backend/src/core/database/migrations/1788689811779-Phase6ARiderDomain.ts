import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase6ARiderDomain1788689811779 implements MigrationInterface {
    name = 'Phase6ARiderDomain1788689811779'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create new enums
        await queryRunner.query(`CREATE TYPE "public"."rider_profiles_kycstatus_enum" AS ENUM('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')`);
        await queryRunner.query(`CREATE TYPE "public"."rider_profiles_availabilitystatus_enum" AS ENUM('OFFLINE', 'ONLINE', 'BUSY', 'SUSPENDED')`);
        
        // Add new columns with defaults so they apply to existing rows safely
        await queryRunner.query(`ALTER TABLE "rider_profiles" ADD "kycStatus" "public"."rider_profiles_kycstatus_enum" NOT NULL DEFAULT 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" ADD "availabilityStatus" "public"."rider_profiles_availabilitystatus_enum" NOT NULL DEFAULT 'OFFLINE'`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" ADD "vehicleRegistration" character varying`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" ADD "licenseNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" ADD "version" integer NOT NULL DEFAULT 1`);

        // Safely map existing status
        await queryRunner.query(`UPDATE "rider_profiles" SET "availabilityStatus" = 'OFFLINE' WHERE "status" = 'OFF_DUTY'`);
        await queryRunner.query(`UPDATE "rider_profiles" SET "availabilityStatus" = 'ONLINE' WHERE "status" = 'ONLINE'`);
        await queryRunner.query(`UPDATE "rider_profiles" SET "availabilityStatus" = 'BUSY' WHERE "status" = 'DELIVERY_ACTIVE'`);

        // Now drop the old status column
        await queryRunner.query(`ALTER TABLE "rider_profiles" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."rider_profiles_status_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Recreate old enum and column
        await queryRunner.query(`CREATE TYPE "public"."rider_profiles_status_enum" AS ENUM('OFF_DUTY', 'ONLINE', 'DELIVERY_ACTIVE')`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" ADD "status" "public"."rider_profiles_status_enum" NOT NULL DEFAULT 'OFF_DUTY'`);

        // Reverse map data
        await queryRunner.query(`UPDATE "rider_profiles" SET "status" = 'OFF_DUTY' WHERE "availabilityStatus" = 'OFFLINE'`);
        await queryRunner.query(`UPDATE "rider_profiles" SET "status" = 'ONLINE' WHERE "availabilityStatus" = 'ONLINE'`);
        await queryRunner.query(`UPDATE "rider_profiles" SET "status" = 'DELIVERY_ACTIVE' WHERE "availabilityStatus" = 'BUSY'`);

        // Drop new columns
        await queryRunner.query(`ALTER TABLE "rider_profiles" DROP COLUMN "version"`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" DROP COLUMN "licenseNumber"`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" DROP COLUMN "vehicleRegistration"`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" DROP COLUMN "availabilityStatus"`);
        await queryRunner.query(`DROP TYPE "public"."rider_profiles_availabilitystatus_enum"`);
        await queryRunner.query(`ALTER TABLE "rider_profiles" DROP COLUMN "kycStatus"`);
        await queryRunner.query(`DROP TYPE "public"."rider_profiles_kycstatus_enum"`);
    }

}
