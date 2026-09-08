import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCartsAndCartItems1788615002070 implements MigrationInterface {
    name = 'AddCartsAndCartItems1788615002070'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_72679d98b31c737937b8932ebe6"`);
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_a4393093f31aabad6de1f54b0e9"`);
        await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN "customerId"`);
        await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN "version"`);
        await queryRunner.query(`ALTER TABLE "carts" ADD "userId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "UQ_69828a178f152f157dcf2f70a89" UNIQUE ("userId")`);
        await queryRunner.query(`ALTER TABLE "cart_items" ALTER COLUMN "quantity" SET DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_c61156b8521ac8300d763eee61c"`);
        await queryRunner.query(`ALTER TABLE "carts" ALTER COLUMN "shopId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "UQ_2bf7996b7946ce753b60a87468c" UNIQUE ("cartId", "productId")`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_72679d98b31c737937b8932ebe6" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "FK_69828a178f152f157dcf2f70a89" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "FK_c61156b8521ac8300d763eee61c" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_c61156b8521ac8300d763eee61c"`);
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_69828a178f152f157dcf2f70a89"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_72679d98b31c737937b8932ebe6"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "UQ_2bf7996b7946ce753b60a87468c"`);
        await queryRunner.query(`ALTER TABLE "carts" ALTER COLUMN "shopId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "FK_c61156b8521ac8300d763eee61c" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ALTER COLUMN "quantity" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "UQ_69828a178f152f157dcf2f70a89"`);
        await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "carts" ADD "version" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "carts" ADD "customerId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "FK_a4393093f31aabad6de1f54b0e9" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_72679d98b31c737937b8932ebe6" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
