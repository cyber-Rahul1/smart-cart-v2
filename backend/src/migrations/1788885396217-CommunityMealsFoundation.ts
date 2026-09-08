import { MigrationInterface, QueryRunner } from "typeorm";

export class CommunityMealsFoundation1788885396217 implements MigrationInterface {
    name = 'CommunityMealsFoundation1788885396217'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."community_meal_clusters_status_enum" AS ENUM('GATHERING_DEMAND', 'OFFERING', 'SELECTION_OPEN', 'THRESHOLD_MET', 'FULFILLED', 'EXPIRED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "community_meal_clusters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "centroid" geography(Point,4326) NOT NULL, "timeWindowStart" TIMESTAMP WITH TIME ZONE NOT NULL, "timeWindowEnd" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."community_meal_clusters_status_enum" NOT NULL DEFAULT 'GATHERING_DEMAND', "minimumThreshold" integer NOT NULL DEFAULT '3', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3c21c1fdbd7f0985b0601890201" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3db0072afaadf700648f5a3435" ON "community_meal_clusters" USING gist ("centroid") `);
        await queryRunner.query(`CREATE INDEX "IDX_99817e6fe72699872659c4be50" ON "community_meal_clusters"  ("status", "timeWindowStart") `);
        await queryRunner.query(`CREATE TYPE "public"."community_meal_requests_status_enum" AS ENUM('SEARCHING', 'OFFERING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TABLE "community_meal_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "clusterId" uuid, "location" geography(Point,4326) NOT NULL, "mealType" character varying NOT NULL, "cuisine" character varying NOT NULL, "servings" integer NOT NULL DEFAULT '1', "spiceLevel" character varying, "budgetMin" numeric(14,2) NOT NULL, "budgetMax" numeric(14,2) NOT NULL, "timeWindowStart" TIMESTAMP WITH TIME ZONE NOT NULL, "timeWindowEnd" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."community_meal_requests_status_enum" NOT NULL DEFAULT 'SEARCHING', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c8c68fcce69e726e89f093a6797" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f9f9f629ea07f3f88d7a66b013" ON "community_meal_requests" USING gist ("location") `);
        await queryRunner.query(`CREATE INDEX "IDX_992c0d1dd5d88b070ec86f5865" ON "community_meal_requests"  ("expiresAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_0bd73d12f62e986532083206c2" ON "community_meal_requests"  ("userId", "status") `);
        await queryRunner.query(`CREATE TYPE "public"."community_meal_offers_status_enum" AS ENUM('ACTIVE', 'WITHDRAWN', 'EXPIRED')`);
        await queryRunner.query(`CREATE TABLE "community_meal_offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clusterId" uuid NOT NULL, "shopId" uuid NOT NULL, "pricePerServing" numeric(14,2) NOT NULL, "minQuantity" integer NOT NULL DEFAULT '1', "maxQuantity" integer NOT NULL, "availableQty" integer NOT NULL, "menuDescription" text NOT NULL, "status" "public"."community_meal_offers_status_enum" NOT NULL DEFAULT 'ACTIVE', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "menuLockAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8d0c1ad8034f8e6e8ab4adf816d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_36cd38b6ea5eb0c4214707dbe3" ON "community_meal_offers"  ("expiresAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_04032389fd32c3725f261e8ffb" ON "community_meal_offers"  ("clusterId", "status") `);
        await queryRunner.query(`CREATE TYPE "public"."meal_allocations_status_enum" AS ENUM('PENDING', 'RESERVED', 'CONFIRMING', 'CONFIRMED', 'SYNTHESIZED', 'DELIVERED', 'FAILED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "meal_allocations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "requestId" uuid NOT NULL, "offerId" uuid NOT NULL, "userId" uuid NOT NULL, "status" "public"."meal_allocations_status_enum" NOT NULL DEFAULT 'PENDING', "paymentSessionId" character varying, "expiresAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c065e82236291fc5fbe7ae15c78" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ed78a50b951d142ab4ee7408fb" ON "meal_allocations"  ("status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_01ddb2540a2730dd7fa4dc690e" ON "meal_allocations"  ("userId", "requestId") WHERE status IN ('RESERVED', 'CONFIRMING', 'CONFIRMED')`);
        await queryRunner.query(`CREATE TABLE "meal_conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "allocationId" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_9e72f2666f45207b8971f1a308" UNIQUE ("allocationId"), CONSTRAINT "PK_7e6a8829e7845a50903b170bf3f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."meal_menu_ledgers_status_enum" AS ENUM('DRAFT', 'LOCKED')`);
        await queryRunner.query(`CREATE TABLE "meal_menu_ledgers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "allocationId" uuid NOT NULL, "basePrice" numeric(14,2) NOT NULL, "allergens" jsonb, "ingredients" jsonb, "substitutions" jsonb, "spiceLevel" character varying, "status" "public"."meal_menu_ledgers_status_enum" NOT NULL DEFAULT 'DRAFT', "menuLockAt" TIMESTAMP WITH TIME ZONE, "finalizedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_a3d6c28f1791eeec9d416a99cb" UNIQUE ("allocationId"), CONSTRAINT "PK_a0cfaa10f0f1191ce3427ed973f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."kitchen_compliance_fssaistatus_enum" AS ENUM('VALID', 'EXPIRED', 'REVOKED', 'PENDING')`);
        await queryRunner.query(`CREATE TYPE "public"."kitchen_compliance_operationalstatus_enum" AS ENUM('ELIGIBLE', 'SUSPENDED', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "kitchen_compliance" ("shopId" uuid NOT NULL, "kycStatus" character varying NOT NULL DEFAULT 'PENDING', "fssaiLicense" character varying, "fssaiValidFrom" TIMESTAMP WITH TIME ZONE, "fssaiValidUntil" TIMESTAMP WITH TIME ZONE, "fssaiStatus" "public"."kitchen_compliance_fssaistatus_enum" NOT NULL DEFAULT 'PENDING', "settlementAccountStatus" character varying NOT NULL DEFAULT 'PENDING', "operationalStatus" "public"."kitchen_compliance_operationalstatus_enum" NOT NULL DEFAULT 'INACTIVE', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_55a19f793a30fe9067503ba620e" PRIMARY KEY ("shopId"))`);
        await queryRunner.query(`CREATE TYPE "public"."settlement_instructions_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'FAILED_RETRY')`);
        await queryRunner.query(`CREATE TABLE "settlement_instructions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid, "providerAccountId" uuid NOT NULL, "customerGrossAmount" numeric(14,2) NOT NULL, "providerGrossAmount" numeric(14,2) NOT NULL, "platformCommission" numeric(14,2) NOT NULL, "paymentGatewayFees" numeric(14,2) NOT NULL, "discounts" numeric(14,2) NOT NULL DEFAULT '0', "refunds" numeric(14,2) NOT NULL DEFAULT '0', "adjustments" numeric(14,2) NOT NULL DEFAULT '0', "providerNetSettlement" numeric(14,2) NOT NULL, "status" "public"."settlement_instructions_status_enum" NOT NULL DEFAULT 'PENDING', "providerTransferId" character varying, "idempotencyKey" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_af15284f0a04aebcf0df63eedb8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_23e3fa3d780bc41ac23cce266e" ON "settlement_instructions"  ("idempotencyKey") `);
        await queryRunner.query(`CREATE INDEX "IDX_7c92667220948eb2c6256fd5aa" ON "settlement_instructions"  ("orderId") `);
        await queryRunner.query(`CREATE INDEX "IDX_5e91908eb770c77821a3623869" ON "settlement_instructions"  ("providerAccountId", "status") `);
        await queryRunner.query(`ALTER TABLE "community_meal_requests" ADD CONSTRAINT "FK_7882c31154fbb4e4043805648c8" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "community_meal_requests" ADD CONSTRAINT "FK_7b91e78a120a5be78ee8daf765e" FOREIGN KEY ("clusterId") REFERENCES "community_meal_clusters"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ADD CONSTRAINT "FK_b32da06f2b8897c5d976621459d" FOREIGN KEY ("clusterId") REFERENCES "community_meal_clusters"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" ADD CONSTRAINT "FK_68843912fdc2dffcb8c44f025fe" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" ADD CONSTRAINT "FK_03dc2f718985b5d663c13621b48" FOREIGN KEY ("requestId") REFERENCES "community_meal_requests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" ADD CONSTRAINT "FK_d816dc3c60249e6d7673f3ae2bc" FOREIGN KEY ("offerId") REFERENCES "community_meal_offers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" ADD CONSTRAINT "FK_0e6c23657ad5e82c8085dc86372" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "meal_conversations" ADD CONSTRAINT "FK_9e72f2666f45207b8971f1a308f" FOREIGN KEY ("allocationId") REFERENCES "meal_allocations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "meal_menu_ledgers" ADD CONSTRAINT "FK_a3d6c28f1791eeec9d416a99cb9" FOREIGN KEY ("allocationId") REFERENCES "meal_allocations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "kitchen_compliance" ADD CONSTRAINT "FK_55a19f793a30fe9067503ba620e" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" ADD CONSTRAINT "FK_7c92667220948eb2c6256fd5aa4" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" ADD CONSTRAINT "FK_ee6a7dbfb3e2e471328ffd26ce3" FOREIGN KEY ("providerAccountId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlement_instructions" DROP CONSTRAINT "FK_ee6a7dbfb3e2e471328ffd26ce3"`);
        await queryRunner.query(`ALTER TABLE "settlement_instructions" DROP CONSTRAINT "FK_7c92667220948eb2c6256fd5aa4"`);
        await queryRunner.query(`ALTER TABLE "kitchen_compliance" DROP CONSTRAINT "FK_55a19f793a30fe9067503ba620e"`);
        await queryRunner.query(`ALTER TABLE "meal_menu_ledgers" DROP CONSTRAINT "FK_a3d6c28f1791eeec9d416a99cb9"`);
        await queryRunner.query(`ALTER TABLE "meal_conversations" DROP CONSTRAINT "FK_9e72f2666f45207b8971f1a308f"`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" DROP CONSTRAINT "FK_0e6c23657ad5e82c8085dc86372"`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" DROP CONSTRAINT "FK_d816dc3c60249e6d7673f3ae2bc"`);
        await queryRunner.query(`ALTER TABLE "meal_allocations" DROP CONSTRAINT "FK_03dc2f718985b5d663c13621b48"`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" DROP CONSTRAINT "FK_68843912fdc2dffcb8c44f025fe"`);
        await queryRunner.query(`ALTER TABLE "community_meal_offers" DROP CONSTRAINT "FK_b32da06f2b8897c5d976621459d"`);
        await queryRunner.query(`ALTER TABLE "community_meal_requests" DROP CONSTRAINT "FK_7b91e78a120a5be78ee8daf765e"`);
        await queryRunner.query(`ALTER TABLE "community_meal_requests" DROP CONSTRAINT "FK_7882c31154fbb4e4043805648c8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5e91908eb770c77821a3623869"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7c92667220948eb2c6256fd5aa"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_23e3fa3d780bc41ac23cce266e"`);
        await queryRunner.query(`DROP TABLE "settlement_instructions"`);
        await queryRunner.query(`DROP TYPE "public"."settlement_instructions_status_enum"`);
        await queryRunner.query(`DROP TABLE "kitchen_compliance"`);
        await queryRunner.query(`DROP TYPE "public"."kitchen_compliance_operationalstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."kitchen_compliance_fssaistatus_enum"`);
        await queryRunner.query(`DROP TABLE "meal_menu_ledgers"`);
        await queryRunner.query(`DROP TYPE "public"."meal_menu_ledgers_status_enum"`);
        await queryRunner.query(`DROP TABLE "meal_conversations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01ddb2540a2730dd7fa4dc690e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ed78a50b951d142ab4ee7408fb"`);
        await queryRunner.query(`DROP TABLE "meal_allocations"`);
        await queryRunner.query(`DROP TYPE "public"."meal_allocations_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_04032389fd32c3725f261e8ffb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_36cd38b6ea5eb0c4214707dbe3"`);
        await queryRunner.query(`DROP TABLE "community_meal_offers"`);
        await queryRunner.query(`DROP TYPE "public"."community_meal_offers_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0bd73d12f62e986532083206c2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_992c0d1dd5d88b070ec86f5865"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f9f9f629ea07f3f88d7a66b013"`);
        await queryRunner.query(`DROP TABLE "community_meal_requests"`);
        await queryRunner.query(`DROP TYPE "public"."community_meal_requests_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_99817e6fe72699872659c4be50"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3db0072afaadf700648f5a3435"`);
        await queryRunner.query(`DROP TABLE "community_meal_clusters"`);
        await queryRunner.query(`DROP TYPE "public"."community_meal_clusters_status_enum"`);
    }

}
