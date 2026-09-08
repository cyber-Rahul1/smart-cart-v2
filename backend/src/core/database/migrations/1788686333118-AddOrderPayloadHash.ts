import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderPayloadHash1788686333118 implements MigrationInterface {
    name = 'AddOrderPayloadHash1788686333118'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "requestPayloadHash" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "requestPayloadHash"`);
    }

}
