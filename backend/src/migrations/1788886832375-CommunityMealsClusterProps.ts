import { MigrationInterface, QueryRunner } from "typeorm";

export class CommunityMealsClusterProps1788886832375 implements MigrationInterface {
    name = 'CommunityMealsClusterProps1788886832375'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "community_meal_clusters" ADD "cuisine" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "community_meal_clusters" ADD "mealType" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "community_meal_clusters" ADD "dietaryRestrictions" character varying`);
        await queryRunner.query(`ALTER TABLE "community_meal_clusters" ADD "spiceLevel" character varying`);
        await queryRunner.query(`ALTER TABLE "community_meal_requests" ADD "dietaryRestrictions" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "community_meal_requests" DROP COLUMN "dietaryRestrictions"`);
        await queryRunner.query(`ALTER TABLE "community_meal_clusters" DROP COLUMN "spiceLevel"`);
        await queryRunner.query(`ALTER TABLE "community_meal_clusters" DROP COLUMN "dietaryRestrictions"`);
        await queryRunner.query(`ALTER TABLE "community_meal_clusters" DROP COLUMN "mealType"`);
        await queryRunner.query(`ALTER TABLE "community_meal_clusters" DROP COLUMN "cuisine"`);
    }

}
