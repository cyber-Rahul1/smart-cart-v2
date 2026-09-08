import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase6CLocationTracking1788692654191 implements MigrationInterface {
    name = 'Phase6CLocationTracking1788692654191'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_76be93114c6cd0a4b7b746b692"`);
        await queryRunner.query(`ALTER TABLE "rider_locations" ADD "deliveryId" uuid`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_76be93114c6cd0a4b7b746b692" ON "rider_locations"  ("riderId", "timestamp") `);
        await queryRunner.query(`ALTER TABLE "rider_locations" ADD CONSTRAINT "FK_d8974d1525fa819aa25bf9c2be9" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rider_locations" DROP CONSTRAINT "FK_d8974d1525fa819aa25bf9c2be9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_76be93114c6cd0a4b7b746b692"`);
        await queryRunner.query(`ALTER TABLE "rider_locations" DROP COLUMN "deliveryId"`);
        await queryRunner.query(`CREATE INDEX "IDX_76be93114c6cd0a4b7b746b692" ON "rider_locations" USING btree ("riderId", "timestamp") `);
    }

}
