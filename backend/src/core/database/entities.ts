// Audit Entities
import { AuditLog } from '../../modules/audit/entities/audit-log.entity.js';
import { Message } from '../../modules/audit/entities/message.entity.js';
import { Notification } from '../../modules/audit/entities/notification.entity.js';
import { Review } from '../../modules/audit/entities/review.entity.js';

// Outbox Entities
import { OutboxEvent } from '../../modules/outbox/entities/outbox-event.entity.js';

// Financial Entities
import { Commission } from '../../modules/financials/entities/commission.entity.js';
import { Payout } from '../../modules/financials/entities/payout.entity.js';
import { Settlement } from '../../modules/financials/entities/settlement.entity.js';

// Logistics Entities
import { DeliveryOffer } from '../../modules/logistics/entities/delivery-offer.entity.js';
import { Delivery } from '../../modules/logistics/entities/delivery.entity.js';
import { RiderLocation } from '../../modules/logistics/entities/rider-location.entity.js';

// Order Entities
import { CartItem } from '../../modules/carts/entities/cart-item.entity.js';
import { Cart } from '../../modules/carts/entities/cart.entity.js';
import { OrderItem } from '../../modules/orders/entities/order-item.entity.js';
import { Order } from '../../modules/orders/entities/order.entity.js';

// Payment Entities
import { Payment } from '../../modules/payments/entities/payment.entity.js';
import { WebhookEvent } from '../../modules/payments/entities/webhook-event.entity.js';

// Product Entities
import { Category } from '../../modules/products/entities/category.entity.js';
import { Product } from '../../modules/products/entities/product.entity.js';

// Shop Entities
import { ShopHours } from '../../modules/shops/entities/shop-hours.entity.js';
import { Shop } from '../../modules/shops/entities/shop.entity.js';

// User Entities
import { Address } from '../../modules/users/entities/address.entity.js';
import { CustomerProfile } from '../../modules/users/entities/customer-profile.entity.js';
import { Device } from '../../modules/users/entities/device.entity.js';
import { RiderProfile } from '../../modules/users/entities/rider-profile.entity.js';
import { ShopkeeperProfile } from '../../modules/users/entities/shopkeeper-profile.entity.js';
import { User } from '../../modules/users/entities/user.entity.js';

export const ALL_ENTITIES = [
  AuditLog,
  Message,
  Notification,
  Review,
  Commission,
  Payout,
  Settlement,
  DeliveryOffer,
  Delivery,
  RiderLocation,
  CartItem,
  Cart,
  OrderItem,
  Order,
  Payment,
  WebhookEvent,
  Category,
  Product,
  ShopHours,
  Shop,
  Address,
  CustomerProfile,
  Device,
  RiderProfile,
  ShopkeeperProfile,
  User,
  OutboxEvent
];
