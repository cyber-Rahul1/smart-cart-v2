import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase12BOfferCapacity1788889778779 implements MigrationInterface {
    name = 'Phase12BOfferCapacity1788889778779'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ADD "reservedQty" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ADD "committedQty" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ALTER COLUMN "availableQty" SET DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ADD CONSTRAINT "CHK_e6aa3cf984a79f7a0bc13b4e5f" CHECK ("availableQty" + "reservedQty" + "committedQty" <= "maxQuantity")`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ADD CONSTRAINT "CHK_3162025e4fe2aa979fc09cc04a" CHECK ("committedQty" >= 0)`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ADD CONSTRAINT "CHK_0c83c1b97c8f4fca78081e0c31" CHECK ("reservedQty" >= 0)`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ADD CONSTRAINT "CHK_2608a8964efdd013a24b060faa" CHECK ("availableQty" >= 0)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "community_meal_offers" DROP CONSTRAINT "CHK_2608a8964efdd013a24b060faa"`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" DROP CONSTRAINT "CHK_0c83c1b97c8f4fca78081e0c31"`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" DROP CONSTRAINT "CHK_3162025e4fe2aa979fc09cc04a"`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" DROP CONSTRAINT "CHK_e6aa3cf984a79f7a0bc13b4e5f"`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ALTER COLUMN "availableQty" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" DROP COLUMN "committedQty"`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" DROP COLUMN "reservedQty"`);
    }

}
