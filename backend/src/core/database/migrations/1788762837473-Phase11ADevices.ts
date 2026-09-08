import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase11ADevices1788762837473 implements MigrationInterface {
    name = 'Phase11ADevices1788762837473'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "devices" ADD "pushToken" character varying`);
        await queryRunner.query(`ALTER TABLE "devices" ADD "pushProvider" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN "pushProvider"`);
        await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN "pushToken"`);
    }

}
