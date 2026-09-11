import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayoutProviderTransferIndex1789106616011 implements MigrationInterface {
    name = 'AddPayoutProviderTransferIndex1789106616011';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE INDEX "IDX_providerTransferId_settlement_instructions" ON "settlement_instructions" ("providerTransferId")`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "IDX_providerTransferId_settlement_instructions"`
        );
    }
}
