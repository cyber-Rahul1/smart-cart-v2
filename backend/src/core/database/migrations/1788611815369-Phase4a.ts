import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase4a1788611815369 implements MigrationInterface {
    name = 'Phase4a1788611815369'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" ADD "image" character varying`);
        await queryRunner.query(`ALTER TABLE "shops" ADD "logo" character varying`);
        await queryRunner.query(`ALTER TABLE "shops" ADD "banner" character varying`);
        await queryRunner.query(`ALTER TABLE "shops" ADD "deliveryRadius" integer NOT NULL DEFAULT '5000'`);
        await queryRunner.query(`ALTER TABLE "shops" ADD "minimumOrder" numeric(14,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "shops" ADD "preparationTime" integer NOT NULL DEFAULT '30'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shops" DROP COLUMN "preparationTime"`);
        await queryRunner.query(`ALTER TABLE "shops" DROP COLUMN "minimumOrder"`);
        await queryRunner.query(`ALTER TABLE "shops" DROP COLUMN "deliveryRadius"`);
        await queryRunner.query(`ALTER TABLE "shops" DROP COLUMN "banner"`);
        await queryRunner.query(`ALTER TABLE "shops" DROP COLUMN "logo"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "image"`);
    }

}
