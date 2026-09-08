import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateReviewEntity1788706746449 implements MigrationInterface {
    name = 'UpdateReviewEntity1788706746449'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "rating"`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD "shopRating" integer`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD "riderId" character varying`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD "riderRating" integer`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_53a68dc905777554b7f702791fa"`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "UQ_53a68dc905777554b7f702791fa" UNIQUE ("orderId")`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_53a68dc905777554b7f702791fa" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_53a68dc905777554b7f702791fa"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "UQ_53a68dc905777554b7f702791fa"`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_53a68dc905777554b7f702791fa" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "riderRating"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "riderId"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "shopRating"`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD "rating" integer NOT NULL`);
    }

}
