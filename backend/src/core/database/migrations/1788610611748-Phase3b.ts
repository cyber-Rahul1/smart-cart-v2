import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase3b1788610611748 implements MigrationInterface {
    name = 'Phase3b1788610611748'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."users_roles_enum" ADD VALUE 'SUPER_ADMIN'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_roles_enum_old" AS ENUM('CUSTOMER', 'SHOPKEEPER', 'RIDER', 'ADMIN')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "roles" TYPE "public"."users_roles_enum_old"[] USING "roles"::"text"::"public"."users_roles_enum_old"[]`);
        await queryRunner.query(`DROP TYPE "public"."users_roles_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_roles_enum_old" RENAME TO "users_roles_enum"`);
    }

}
