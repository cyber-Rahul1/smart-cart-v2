import { AppDataSource } from '../data-source.js';
import { User } from '../../../modules/users/entities/user.entity.js';
import { UserRole } from '../../../modules/users/enums/user-role.enum.js';
import { Shop } from '../../../modules/shops/entities/shop.entity.js';
import { Category } from '../../../modules/products/entities/category.entity.js';
import { Product } from '../../../modules/products/entities/product.entity.js';

async function runSeed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: Seed script cannot be run in production environment!');
    process.exit(1);
  }

  await AppDataSource.initialize();
  console.log('Database connected');

  const userRepository = AppDataSource.getRepository(User);
  const shopRepository = AppDataSource.getRepository(Shop);
  const categoryRepository = AppDataSource.getRepository(Category);
  const productRepository = AppDataSource.getRepository(Product);

  // Clear existing data for seed idempotency
  await AppDataSource.query('TRUNCATE TABLE "users", "shops", "categories", "products" CASCADE');

  // 1. Create Users
  const adminUser = userRepository.create({
    phoneNumber: '+10000000000',
    roles: [UserRole.ADMIN],
  });
  await userRepository.save(adminUser);

  const shopkeeperUser = userRepository.create({
    phoneNumber: '+10000000001',
    roles: [UserRole.SHOPKEEPER],
  });
  await userRepository.save(shopkeeperUser);

  const customerUser = userRepository.create({
    phoneNumber: '+10000000002',
    roles: [UserRole.CUSTOMER],
  });
  await userRepository.save(customerUser);

  const riderUser = userRepository.create({
    phoneNumber: '+10000000003',
    roles: [UserRole.RIDER],
  });
  await userRepository.save(riderUser);

  // 2. Create Shop
  const shop = shopRepository.create({
    owner: shopkeeperUser,
    name: 'Fresh Grocery Market',
    description: 'Local fresh produce and daily needs',
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716], // Longitude, Latitude
    },
  });
  await shopRepository.save(shop);

  // 3. Create Category
  const category = categoryRepository.create({
    shop: shop,
    name: 'Fresh Vegetables',
  });
  await categoryRepository.save(category);

  // 4. Create Product
  const product = productRepository.create({
    shop: shop,
    category: category,
    name: 'Organic Tomatoes',
    price: 45.00,
  });
  await productRepository.save(product);

  console.log('Seed completed successfully');
  await AppDataSource.destroy();
}

runSeed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
