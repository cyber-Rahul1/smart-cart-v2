import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'smartcart',
});

async function run() {
  await AppDataSource.initialize();
  const phones = ['+9911111111', '+9922222222', '+9933333333', '+9944444444'];
  await AppDataSource.query(`DELETE FROM products WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
  await AppDataSource.query(`DELETE FROM categories WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
  await AppDataSource.query(`DELETE FROM shop_hours WHERE "shopId" IN (SELECT id FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1)))`, [phones]);
  await AppDataSource.query(`DELETE FROM shops WHERE "ownerId" IN (SELECT id FROM users WHERE "phoneNumber" = ANY($1))`, [phones]);
  await AppDataSource.query(`DELETE FROM users WHERE "phoneNumber" = ANY($1)`, [phones]);
  await AppDataSource.destroy();
}
run();
