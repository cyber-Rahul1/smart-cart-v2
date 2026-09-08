import { PushPayloadBuilder } from './push-payload.builder.js';

describe('PushPayloadBuilder', () => {
  let builder: PushPayloadBuilder;

  beforeEach(() => {
    builder = new PushPayloadBuilder();
  });

  it('should build payload for customer order', () => {
    const payload = builder.buildPayload('order.status.changed', 'order-123');
    expect(payload).toEqual({
      type: 'order.status.changed',
      entityId: 'order-123',
      deepLink: 'smartcart://orders/order-123',
    });
  });

  it('should build payload for rider delivery', () => {
    const payload = builder.buildPayload('rider.delivery.assigned', 'delivery-456');
    expect(payload).toEqual({
      type: 'rider.delivery.assigned',
      entityId: 'delivery-456',
      deepLink: 'smartcart-rider://deliveries/delivery-456',
    });
  });

  it('should build payload for shop order', () => {
    const payload = builder.buildPayload('shop.order.received', 'order-789');
    expect(payload).toEqual({
      type: 'shop.order.received',
      entityId: 'order-789',
      deepLink: 'smartcart-shop://orders/order-789',
    });
  });
});
