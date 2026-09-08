import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEventIdToNotification1788706321933 implements MigrationInterface {
    name = 'AddEventIdToNotification1788706321933'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" ADD "eventId" character varying`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "UQ_3337493bfdc5d0fccd4bd5f51e3" UNIQUE ("eventId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "UQ_3337493bfdc5d0fccd4bd5f51e3"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "eventId"`);
    }

}
