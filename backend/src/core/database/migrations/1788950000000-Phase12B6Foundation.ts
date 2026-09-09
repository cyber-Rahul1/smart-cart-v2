import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase12B6Foundation1788950000000 implements MigrationInterface {
    name = 'Phase12B6Foundation1788950000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // meal_messages table
        await queryRunner.query(`
            CREATE TABLE "meal_messages" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "conversationId" uuid NOT NULL,
                "senderId" uuid NOT NULL,
                "senderRole" character varying(50) NOT NULL,
                "content" character varying(2000) NOT NULL,
                "idempotencyKey" character varying,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_meal_messages_id" PRIMARY KEY ("id")
            )
        `);

        // version column on meal_menu_ledgers
        await queryRunner.query(`ALTER TABLE "meal_menu_ledgers" ADD "version" integer NOT NULL DEFAULT 1`);

        // unique index on allocationId in meal_conversations
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_meal_conversations_allocationId" ON "meal_conversations" ("allocationId")`);

        // indexes on meal_messages
        await queryRunner.query(`CREATE INDEX "IDX_meal_messages_conversationId_createdAt" ON "meal_messages" ("conversationId", "createdAt")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_meal_messages_conversationId_idempotencyKey" ON "meal_messages" ("conversationId", "idempotencyKey")`);

        // foreign key
        await queryRunner.query(`
            ALTER TABLE "meal_messages"
            ADD CONSTRAINT "FK_meal_messages_conversationId" FOREIGN KEY ("conversationId") REFERENCES "meal_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "meal_messages" DROP CONSTRAINT "FK_meal_messages_conversationId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_meal_messages_conversationId_idempotencyKey"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_meal_messages_conversationId_createdAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_meal_conversations_allocationId"`);
        await queryRunner.query(`ALTER TABLE "meal_menu_ledgers" DROP COLUMN "version"`);
        await queryRunner.query(`DROP TABLE "meal_messages"`);
    }
}
