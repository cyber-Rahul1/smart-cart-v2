import { MigrationInterface, QueryRunner } from "typeorm";

export class AddShopCommissionRate1788951065027 implements MigrationInterface {
    name = 'AddShopCommissionRate1788951065027'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shops" ADD "commissionRate" numeric(5,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "shops" ADD CONSTRAINT "CHK_shops_commissionRate" CHECK ("commissionRate" >= 0 AND "commissionRate" <= 100)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shops" DROP CONSTRAINT "CHK_shops_commissionRate"`);
        await queryRunner.query(`ALTER TABLE "shops" DROP COLUMN "commissionRate"`);
    }

}
