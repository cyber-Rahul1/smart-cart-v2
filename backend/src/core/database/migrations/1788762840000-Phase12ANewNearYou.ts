import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase12ANewNearYou1788762840000 implements MigrationInterface {
  name = 'Phase12ANewNearYou1788762840000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add publishedAt column
    await queryRunner.query(`ALTER TABLE "shops" ADD "publishedAt" TIMESTAMP WITH TIME ZONE`);

    // 2. Backfill publishedAt for existing shops
    // ACTIVE -> createdAt
    // INACTIVE -> NULL (which is the default, so we only need to update ACTIVE)
    await queryRunner.query(`
      UPDATE "shops" 
      SET "publishedAt" = "createdAt" 
      WHERE "status" = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shops" DROP COLUMN "publishedAt"`);
  }
}
