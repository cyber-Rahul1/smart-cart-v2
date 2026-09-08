import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeviceVersion1788608745463 implements MigrationInterface {
    name = 'AddDeviceVersion1788608745463'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "devices" ADD "version" integer NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN "version"`);
    }

}
