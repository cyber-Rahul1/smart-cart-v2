/**
 * Phase 12B-6 REST/API Tests
 *
 * Controller-layer unit tests that mock all three services.
 * Tests cover: authentication, authorization delegation, DTO validation,
 * idempotency header passing, cursor/pagination, error propagation,
 * and rate-limit decorator presence.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { CommunityMealConversationController } from '../controllers/community-meal-conversation.controller.js';
import { CommunityMealMessageController } from '../controllers/community-meal-message.controller.js';
import { CommunityMealLedgerController } from '../controllers/community-meal-ledger.controller.js';
import { CommunityMealConversationService } from '../services/community-meal-conversation.service.js';
import { CommunityMealMessagesService } from '../services/community-meal-messages.service.js';
import { CommunityMealMenuLedgerService } from '../services/community-meal-menu-ledger.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_UUID = 'a0000000-0000-4000-a000-000000000001';
const ANOTHER_UUID = 'b0000000-0000-4000-b000-000000000002';
const CUSTOMER_ID = 'c0000000-0000-4000-c000-000000000001';
const SHOPKEEPER_ID = 'c0000000-0000-4000-c000-000000000002';
const BASE = `/api/v1/community-meals/allocations/${VALID_UUID}`;

const MOCK_CONVERSATION = {
  id: 'conv-0000-0000-0000-0000000000001',
  allocationId: VALID_UUID,
  status: 'ACTIVE',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

const MOCK_MESSAGE = {
  id: 'msg-0000-0000-0000-0000000000001',
  conversationId: MOCK_CONVERSATION.id,
  senderId: CUSTOMER_ID,
  senderRole: 'CUSTOMER',
  content: 'Hello kitchen!',
  idempotencyKey: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

const MOCK_LEDGER = {
  id: 'led-0000-0000-0000-0000000000001',
  allocationId: VALID_UUID,
  basePrice: 150.0,
  allergens: ['nuts'],
  ingredients: ['rice', 'lentils'],
  substitutions: { 'rice': 'quinoa' },
  spiceLevel: 'medium',
  status: 'DRAFT',
  menuLockAt: null,
  finalizedAt: null,
  version: 1,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

// ─── JWT Guard Mock ────────────────────────────────────────────────────────────

/**
 * Reads Authorization header: "Bearer <userId>" for simplicity.
 * Returns { sub: userId } so req.user.sub works.
 */
class MockJwtAuthGuard {
  canActivate(context: any): boolean {
    const req = context.switchToHttp().getRequest();
    const auth: string | undefined = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new ForbiddenException('Unauthorized');
    }
    const userId = auth.replace('Bearer ', '').trim();
    if (!userId || userId === 'invalid') {
      throw new ForbiddenException('Invalid token');
    }
    req.user = { sub: userId };
    return true;
  }
}

// ─── Test Bootstrapper ────────────────────────────────────────────────────────

async function buildApp(
  conversationServiceOverrides: Partial<CommunityMealConversationService> = {},
  messagesServiceOverrides: Partial<CommunityMealMessagesService> = {},
  ledgerServiceOverrides: Partial<CommunityMealMenuLedgerService> = {},
  enableThrottler: boolean = false,
): Promise<INestApplication> {
  const conversationService = {
    getOrCreateConversation: vi.fn().mockResolvedValue(MOCK_CONVERSATION),
    verifyAccess: vi.fn().mockResolvedValue({ role: 'CUSTOMER' }),
    ...conversationServiceOverrides,
  };

  const messagesService = {
    sendMessage: vi.fn().mockResolvedValue(MOCK_MESSAGE),
    getMessages: vi.fn().mockResolvedValue([MOCK_MESSAGE]),
    ...messagesServiceOverrides,
  };

  const ledgerService = {
    getLedger: vi.fn().mockResolvedValue(MOCK_LEDGER),
    kitchenUpdate: vi.fn().mockResolvedValue({ ...MOCK_LEDGER, version: 2 }),
    confirmLedger: vi.fn().mockResolvedValue(undefined),
    ...ledgerServiceOverrides,
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([{ limit: 100, ttl: 60000 }]), // generous for most tests
    ],
    controllers: [
      CommunityMealConversationController,
      CommunityMealMessageController,
      CommunityMealLedgerController,
    ],
    providers: [
      { provide: CommunityMealConversationService, useValue: conversationService },
      { provide: CommunityMealMessagesService, useValue: messagesService },
      { provide: CommunityMealMenuLedgerService, useValue: ledgerService },
      { provide: APP_GUARD, useValue: { canActivate: () => true } },
    ]
  });
  
  if (!enableThrottler) {
    moduleRef.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true });
  }

  const compiled = await moduleRef
    .overrideGuard(JwtAuthGuard)
    .useClass(MockJwtAuthGuard)
    .compile();

  const app = compiled.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTH TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 12B-6 REST — Authentication', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(() => app.close());

  it('GET /conversation → 403 when Authorization header is absent', async () => {
    await request(app.getHttpServer())
      .get(`${BASE}/conversation`)
      .expect(403);
  });

  it('GET /conversation → 403 when token is "invalid"', async () => {
    await request(app.getHttpServer())
      .get(`${BASE}/conversation`)
      .set('Authorization', 'Bearer invalid')
      .expect(403);
  });

  it('GET /conversation/messages → 403 when no token', async () => {
    await request(app.getHttpServer())
      .get(`${BASE}/conversation/messages`)
      .expect(403);
  });

  it('GET /ledger → 403 when no token', async () => {
    await request(app.getHttpServer())
      .get(`${BASE}/ledger`)
      .expect(403);
  });

  it('PUT /ledger → 403 when no token', async () => {
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .expect(403);
  });

  it('POST /ledger/confirm → 403 when no token', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/ledger/confirm`)
      .expect(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CONVERSATION TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 12B-6 REST — Conversation', () => {
  let app: INestApplication;
  let conversationService: any;

  beforeAll(async () => {
    conversationService = {
      getOrCreateConversation: vi.fn().mockResolvedValue(MOCK_CONVERSATION),
      verifyAccess: vi.fn().mockResolvedValue({ role: 'CUSTOMER' }),
    };
    app = await buildApp(conversationService);
  });
  afterAll(() => app.close());

  it('valid customer → 200 with conversation', async () => {
    const res = await request(app.getHttpServer())
      .get(`${BASE}/conversation`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(200);

    expect(res.body.id).toBe(MOCK_CONVERSATION.id);
    expect(conversationService.getOrCreateConversation).toHaveBeenCalledWith(VALID_UUID, CUSTOMER_ID);
  });

  it('valid shopkeeper → 200 with same conversation', async () => {
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    const res = await request(app.getHttpServer())
      .get(`${BASE}/conversation`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .expect(200);

    expect(res.body.id).toBe(MOCK_CONVERSATION.id);
    expect(conversationService.getOrCreateConversation).toHaveBeenCalledWith(VALID_UUID, SHOPKEEPER_ID);
  });

  it('unauthorized user → 403', async () => {
    conversationService.getOrCreateConversation.mockRejectedValue(new ForbiddenException('Unauthorized to access this conversation'));
    await request(app.getHttpServer())
      .get(`${BASE}/conversation`)
      .set('Authorization', 'Bearer unrelated-user')
      .expect(403);
  });

  it('invalid UUID in path → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/community-meals/allocations/not-a-uuid/conversation')
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(400);
  });

  it('allocation not found → 404', async () => {
    conversationService.getOrCreateConversation.mockRejectedValue(new NotFoundException('Allocation not found'));
    await request(app.getHttpServer())
      .get(`${BASE}/conversation`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(404);
  });

  it('second call returns same conversation (idempotent)', async () => {
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    const r1 = await request(app.getHttpServer())
      .get(`${BASE}/conversation`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(200);
    const r2 = await request(app.getHttpServer())
      .get(`${BASE}/conversation`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(200);
    expect(r1.body.id).toBe(r2.body.id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MESSAGE TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 12B-6 REST — Messages', () => {
  let app: INestApplication;
  let conversationService: any;
  let messagesService: any;

  beforeAll(async () => {
    conversationService = {
      getOrCreateConversation: vi.fn().mockResolvedValue(MOCK_CONVERSATION),
      verifyAccess: vi.fn().mockResolvedValue({ role: 'CUSTOMER' }),
    };
    messagesService = {
      sendMessage: vi.fn().mockResolvedValue(MOCK_MESSAGE),
      getMessages: vi.fn().mockResolvedValue([MOCK_MESSAGE]),
    };
    app = await buildApp(conversationService, messagesService);
  });
  afterAll(() => app.close());

  // ── GET messages ───────────────────────────────────────────────────────────

  it('GET messages → 200 with pagination meta for customer', async () => {
    const res = await request(app.getHttpServer())
      .get(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toHaveProperty('hasNext');
    expect(res.body.meta).toHaveProperty('nextCursor');
    expect(res.body.meta).toHaveProperty('limit');
  });

  it('GET messages → 200 for shopkeeper', async () => {
    conversationService.verifyAccess.mockResolvedValue({ role: 'SHOPKEEPER' });
    const res = await request(app.getHttpServer())
      .get(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .expect(200);
    expect(res.body.data).toBeDefined();
  });

  it('GET messages → 403 for unauthorized user', async () => {
    conversationService.verifyAccess.mockRejectedValue(new ForbiddenException('Unauthorized to access this conversation'));
    await request(app.getHttpServer())
      .get(`${BASE}/conversation/messages`)
      .set('Authorization', 'Bearer unrelated-user')
      .expect(403);
  });

  it('GET messages with invalid UUID → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/community-meals/allocations/not-a-uuid/conversation/messages')
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(400);
  });

  it('GET messages limit > 50 → 400 validation error', async () => {
    conversationService.verifyAccess.mockResolvedValue({ role: 'CUSTOMER' });
    await request(app.getHttpServer())
      .get(`${BASE}/conversation/messages?limit=51`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(400);
  });

  it('GET messages passes cursor through to service without modification', async () => {
    conversationService.verifyAccess.mockResolvedValue({ role: 'CUSTOMER' });
    const cursor = Buffer.from(JSON.stringify({ createdAt: '2024-01-01T00:00:00Z', id: MOCK_MESSAGE.id })).toString('base64');
    await request(app.getHttpServer())
      .get(`${BASE}/conversation/messages?cursor=${encodeURIComponent(cursor)}&limit=10`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(200);
    expect(messagesService.getMessages).toHaveBeenCalledWith(
      MOCK_CONVERSATION.id,
      cursor,
      11, // limit + 1 for hasNext detection
    );
  });

  it('GET messages returns hasNext=true and nextCursor when service returns limit+1 results', async () => {
    conversationService.verifyAccess.mockResolvedValue({ role: 'CUSTOMER' });
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    const msgs = Array.from({ length: 21 }, (_, i) => ({
      ...MOCK_MESSAGE,
      id: `msg-${i}`,
      createdAt: new Date(`2024-01-01T00:00:0${i < 10 ? '0' + i : i}Z`),
    }));
    messagesService.getMessages.mockResolvedValue(msgs);

    const res = await request(app.getHttpServer())
      .get(`${BASE}/conversation/messages?limit=20`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(200);

    expect(res.body.meta.hasNext).toBe(true);
    expect(res.body.meta.nextCursor).not.toBeNull();
    expect(res.body.data).toHaveLength(20);
  });

  it('GET messages returns hasNext=false when fewer than limit results', async () => {
    conversationService.verifyAccess.mockResolvedValue({ role: 'CUSTOMER' });
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    messagesService.getMessages.mockResolvedValue([MOCK_MESSAGE]);

    const res = await request(app.getHttpServer())
      .get(`${BASE}/conversation/messages?limit=20`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(200);

    expect(res.body.meta.hasNext).toBe(false);
    expect(res.body.meta.nextCursor).toBeNull();
  });

  it('GET messages invalid cursor → service throws BadRequestException → 400', async () => {
    conversationService.verifyAccess.mockResolvedValue({ role: 'CUSTOMER' });
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    messagesService.getMessages.mockRejectedValue(new BadRequestException('Invalid cursor'));

    await request(app.getHttpServer())
      .get(`${BASE}/conversation/messages?cursor=!!!invalid!!!`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(400);
  });

  // ── POST message ──────────────────────────────────────────────────────────

  it('POST message → 201 for valid customer', async () => {
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    messagesService.sendMessage.mockResolvedValue(MOCK_MESSAGE);
    const res = await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ content: 'Please make it less spicy.' })
      .expect(201);

    expect(res.body.data.id).toBe(MOCK_MESSAGE.id);
    // Verify userId came from JWT not body
    expect(messagesService.sendMessage).toHaveBeenCalledWith(
      CUSTOMER_ID,
      MOCK_CONVERSATION.id,
      'Please make it less spicy.',
      undefined,
    );
  });

  it('POST message → 201 for valid shopkeeper', async () => {
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    messagesService.sendMessage.mockResolvedValue({ ...MOCK_MESSAGE, senderRole: 'SHOPKEEPER' });
    const res = await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ content: 'We can do mild.' })
      .expect(201);
    expect(res.body.data.senderRole).toBe('SHOPKEEPER');
  });

  it('POST message → 403 for unauthorized user', async () => {
    conversationService.getOrCreateConversation.mockRejectedValue(new ForbiddenException('Unauthorized to access this conversation'));
    await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', 'Bearer unrelated-user')
      .send({ content: 'Hack attempt' })
      .expect(403);
  });

  it('POST message → 400 for empty content', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ content: '' })
      .expect(400);
  });

  it('POST message → 400 when content exceeds 2000 characters', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ content: 'x'.repeat(2001) })
      .expect(400);
  });

  it('POST message exactly 2000 characters → 201', async () => {
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    messagesService.sendMessage.mockResolvedValue(MOCK_MESSAGE);
    await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ content: 'x'.repeat(2000) })
      .expect(201);
  });

  it('POST message → 400 when senderId is provided in body (forbidden field)', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ content: 'Hello', senderId: 'injected-id' })
      .expect(400);
  });

  it('POST message → 400 when senderRole is provided in body (forbidden field)', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ content: 'Hello', senderRole: 'SHOPKEEPER' })
      .expect(400);
  });

  it('POST message with x-idempotency-key header → passes key to service', async () => {
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    messagesService.sendMessage.mockResolvedValue(MOCK_MESSAGE);
    const idemKey = 'idem-key-abc-123';
    await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .set('x-idempotency-key', idemKey)
      .send({ content: 'Hello' })
      .expect(201);

    expect(messagesService.sendMessage).toHaveBeenCalledWith(
      CUSTOMER_ID,
      MOCK_CONVERSATION.id,
      'Hello',
      idemKey,
    );
  });

  it('POST message duplicate idempotency key → service returns existing → 201', async () => {
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    messagesService.sendMessage.mockResolvedValue(MOCK_MESSAGE); // service deduplicates
    const res = await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .set('x-idempotency-key', 'duplicate-key')
      .send({ content: 'Hello again' })
      .expect(201);
    expect(res.body.data.id).toBe(MOCK_MESSAGE.id);
  });

  it('POST message READ_ONLY conversation → 403', async () => {
    conversationService.getOrCreateConversation.mockResolvedValue(MOCK_CONVERSATION);
    messagesService.sendMessage.mockRejectedValue(new ForbiddenException('Conversation is READ_ONLY'));
    await request(app.getHttpServer())
      .post(`${BASE}/conversation/messages`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ content: 'Late message' })
      .expect(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LEDGER TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 12B-6 REST — Ledger', () => {
  let app: INestApplication;
  let ledgerService: any;

  beforeAll(async () => {
    ledgerService = {
      getLedger: vi.fn().mockResolvedValue(MOCK_LEDGER),
      kitchenUpdate: vi.fn().mockResolvedValue({ ...MOCK_LEDGER, version: 2 }),
      confirmLedger: vi.fn().mockResolvedValue(undefined),
    };
    app = await buildApp({}, {}, ledgerService);
  });
  afterAll(() => app.close());

  // ── GET ledger ─────────────────────────────────────────────────────────────

  it('GET ledger → 200 for authorized customer', async () => {
    const res = await request(app.getHttpServer())
      .get(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(200);

    expect(res.body.id).toBe(MOCK_LEDGER.id);
    expect(ledgerService.getLedger).toHaveBeenCalledWith(VALID_UUID, CUSTOMER_ID);
  });

  it('GET ledger → 200 for authorized shopkeeper', async () => {
    const res = await request(app.getHttpServer())
      .get(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .expect(200);
    expect(res.body.id).toBe(MOCK_LEDGER.id);
  });

  it('GET ledger → 403 for unauthorized user', async () => {
    ledgerService.getLedger.mockRejectedValue(new ForbiddenException('Unauthorized to access this ledger'));
    await request(app.getHttpServer())
      .get(`${BASE}/ledger`)
      .set('Authorization', 'Bearer unrelated-user')
      .expect(403);
  });

  it('GET ledger invalid UUID → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/community-meals/allocations/not-a-uuid/ledger')
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(400);
  });

  // ── PUT ledger (kitchen update) ────────────────────────────────────────────

  it('PUT ledger → 200 for authorized shopkeeper', async () => {
    ledgerService.kitchenUpdate.mockResolvedValue({ ...MOCK_LEDGER, version: 2, allergens: ['nuts', 'dairy'] });
    const res = await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ expectedVersion: 1, allergens: ['nuts', 'dairy'] })
      .expect(200);

    expect(res.body.version).toBe(2);
    expect(ledgerService.kitchenUpdate).toHaveBeenCalledWith(
      VALID_UUID,
      SHOPKEEPER_ID,
      { allergens: ['nuts', 'dairy'] },
      1,
    );
  });

  it('PUT ledger → 403 for customer (only shopkeeper allowed)', async () => {
    ledgerService.kitchenUpdate.mockRejectedValue(new ForbiddenException('Only the shopkeeper can update the ledger'));
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ expectedVersion: 1 })
      .expect(403);
  });

  it('PUT ledger → 403 for unrelated user', async () => {
    ledgerService.kitchenUpdate.mockRejectedValue(new ForbiddenException('Only the shopkeeper can update the ledger'));
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', 'Bearer unrelated-user')
      .send({ expectedVersion: 1 })
      .expect(403);
  });

  it('PUT ledger → 409 stale version', async () => {
    ledgerService.kitchenUpdate.mockRejectedValue(new ConflictException('Update failed: version conflict'));
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ expectedVersion: 999 })
      .expect(409);
  });

  it('PUT ledger → 409 locked ledger', async () => {
    ledgerService.kitchenUpdate.mockRejectedValue(new ConflictException('Ledger is already locked'));
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ expectedVersion: 1 })
      .expect(409);
  });

  it('PUT ledger → 400 missing expectedVersion', async () => {
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ allergens: ['nuts'] }) // no expectedVersion
      .expect(400);
  });

  it('PUT ledger → 400 when status is sent (forbidden field)', async () => {
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ expectedVersion: 1, status: 'LOCKED' })
      .expect(400);
  });

  it('PUT ledger → 400 when version is sent (forbidden field)', async () => {
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ expectedVersion: 1, version: 5 })
      .expect(400);
  });

  it('PUT ledger → 400 when menuLockAt is sent (forbidden field)', async () => {
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ expectedVersion: 1, menuLockAt: '2025-01-01' })
      .expect(400);
  });

  // ── POST ledger/confirm ────────────────────────────────────────────────────

  it('POST ledger/confirm → 200 for authorized customer', async () => {
    ledgerService.confirmLedger.mockResolvedValue(undefined);
    const res = await request(app.getHttpServer())
      .post(`${BASE}/ledger/confirm`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ expectedVersion: 1 })
      .expect(200);

    expect(res.body.message).toMatch(/confirmed/i);
    expect(ledgerService.confirmLedger).toHaveBeenCalledWith(VALID_UUID, CUSTOMER_ID, 1);
  });

  it('POST ledger/confirm → 403 for shopkeeper (only customer allowed)', async () => {
    ledgerService.confirmLedger.mockRejectedValue(new ForbiddenException('Only the customer can confirm the ledger'));
    await request(app.getHttpServer())
      .post(`${BASE}/ledger/confirm`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ expectedVersion: 1 })
      .expect(403);
  });

  it('POST ledger/confirm → 403 for unrelated customer', async () => {
    ledgerService.confirmLedger.mockRejectedValue(new ForbiddenException('Only the customer can confirm the ledger'));
    await request(app.getHttpServer())
      .post(`${BASE}/ledger/confirm`)
      .set('Authorization', 'Bearer some-other-user')
      .send({ expectedVersion: 1 })
      .expect(403);
  });

  it('POST ledger/confirm → 409 stale version', async () => {
    ledgerService.confirmLedger.mockRejectedValue(new ConflictException('Confirmation failed: version conflict'));
    await request(app.getHttpServer())
      .post(`${BASE}/ledger/confirm`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ expectedVersion: 999 })
      .expect(409);
  });

  it('POST ledger/confirm → 400 missing expectedVersion', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/ledger/confirm`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({})
      .expect(400);
  });

  it('POST ledger/confirm → 400 when expectedVersion is zero (not positive)', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/ledger/confirm`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ expectedVersion: 0 })
      .expect(400);
  });

  it('POST ledger/confirm → 400 when expectedVersion is negative', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/ledger/confirm`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ expectedVersion: -1 })
      .expect(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SERVICE DELEGATION — userId always from JWT
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 12B-6 REST — req.user.sub derivation', () => {
  let app: INestApplication;
  let conversationService: any;
  let ledgerService: any;

  beforeAll(async () => {
    conversationService = {
      getOrCreateConversation: vi.fn().mockResolvedValue(MOCK_CONVERSATION),
      verifyAccess: vi.fn().mockResolvedValue({ role: 'CUSTOMER' }),
    };
    ledgerService = {
      getLedger: vi.fn().mockResolvedValue(MOCK_LEDGER),
      kitchenUpdate: vi.fn().mockResolvedValue({ ...MOCK_LEDGER, version: 2 }),
      confirmLedger: vi.fn().mockResolvedValue(undefined),
    };
    app = await buildApp(conversationService, {}, ledgerService);
  });
  afterAll(() => app.close());

  it('conversation service receives req.user.sub, not any body field', async () => {
    await request(app.getHttpServer())
      .get(`${BASE}/conversation`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .expect(200);
    expect(conversationService.getOrCreateConversation).toHaveBeenCalledWith(VALID_UUID, CUSTOMER_ID);
  });

  it('ledger service receives req.user.sub for GET ledger', async () => {
    await request(app.getHttpServer())
      .get(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .expect(200);
    expect(ledgerService.getLedger).toHaveBeenCalledWith(VALID_UUID, SHOPKEEPER_ID);
  });

  it('ledger service receives req.user.sub for PUT ledger', async () => {
    await request(app.getHttpServer())
      .put(`${BASE}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ expectedVersion: 1 })
      .expect(200);
    expect(ledgerService.kitchenUpdate).toHaveBeenCalledWith(VALID_UUID, SHOPKEEPER_ID, {}, 1);
  });

  it('ledger service receives req.user.sub for POST confirm', async () => {
    await request(app.getHttpServer())
      .post(`${BASE}/ledger/confirm`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ expectedVersion: 1 })
      .expect(200);
    expect(ledgerService.confirmLedger).toHaveBeenCalledWith(VALID_UUID, CUSTOMER_ID, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RATE LIMIT TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 12B-6 REST — Rate Limiting', () => {
  let app: INestApplication;
  let conversationService: any;
  let ledgerService: any;
  let messagesService: any;

  beforeAll(async () => {
    conversationService = {
      getOrCreateConversation: vi.fn().mockResolvedValue(MOCK_CONVERSATION),
      verifyAccess: vi.fn().mockResolvedValue({ role: 'CUSTOMER' }),
    };
    ledgerService = {
      getLedger: vi.fn().mockResolvedValue(MOCK_LEDGER),
      kitchenUpdate: vi.fn().mockResolvedValue({ ...MOCK_LEDGER, version: 2 }),
      confirmLedger: vi.fn().mockResolvedValue(undefined),
    };
    messagesService = {
      sendMessage: vi.fn().mockResolvedValue(MOCK_MESSAGE),
    };
    // Initialize WITH ThrottlerGuard enabled
    app = await buildApp(conversationService, messagesService, ledgerService, true);
  });

  afterAll(() => app.close());

  it('POST messages exceeds configured limit (10) -> 429', async () => {
    const url = `${BASE}/conversation/messages`;
    // Loop 10 times (should succeed)
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${CUSTOMER_ID}`)
        .send({ content: `Msg ${i}` })
        .expect(201);
    }
    // 11th should fail with 429
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ content: 'Too many!' })
      .expect(429);
  });

  it('PUT ledger exceeds configured limit (5) -> 429', async () => {
    // Unique ID to avoid sharing limit bucket with other tests if running parallel
    const BASE_URL = `/api/v1/community-meals/allocations/${ANOTHER_UUID}`;
    
    // Loop 5 times (should succeed)
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .put(`${BASE_URL}/ledger`)
        .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
        .send({ expectedVersion: 1, allergens: [] })
        .expect(200);
    }
    // 6th should fail with 429
    await request(app.getHttpServer())
      .put(`${BASE_URL}/ledger`)
      .set('Authorization', `Bearer ${SHOPKEEPER_ID}`)
      .send({ expectedVersion: 1, allergens: [] })
      .expect(429);
  });

  it('POST ledger/confirm exceeds configured limit (5) -> 429', async () => {
    // Unique ID
    const BASE_URL = `/api/v1/community-meals/allocations/d0000000-0000-4000-a000-000000000009`;
    
    // Loop 5 times (should succeed)
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post(`${BASE_URL}/ledger/confirm`)
        .set('Authorization', `Bearer ${CUSTOMER_ID}`)
        .send({ expectedVersion: 1 })
        .expect(200);
    }
    // 6th should fail with 429
    await request(app.getHttpServer())
      .post(`${BASE_URL}/ledger/confirm`)
      .set('Authorization', `Bearer ${CUSTOMER_ID}`)
      .send({ expectedVersion: 1 })
      .expect(429);
  });
});
