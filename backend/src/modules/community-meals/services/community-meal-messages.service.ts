import { Injectable, BadRequestException, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { MealMessage, MealMessageSenderRole } from '../entities/meal-message.entity.js';
import { MealConversation } from '../entities/meal-conversation.entity.js';
import { CommunityMealConversationService } from './community-meal-conversation.service.js';
import { LedgerEventPublisher } from '../events/ledger-event.publisher.js';

@Injectable()
export class CommunityMealMessagesService {
  constructor(
    @InjectRepository(MealMessage)
    private readonly messageRepo: Repository<MealMessage>,
    @InjectRepository(MealConversation)
    private readonly conversationRepo: Repository<MealConversation>,
    private readonly conversationService: CommunityMealConversationService,
    private readonly eventPublisher: LedgerEventPublisher,
  ) {}

  async sendMessage(userId: string, conversationId: string, content: string, idempotencyKey?: string): Promise<MealMessage> {
    if (!content || content.trim() === '') {
      throw new BadRequestException('Message content cannot be empty');
    }
    if (content.length > 2000) {
      throw new BadRequestException('Message content cannot exceed 2000 characters');
    }

    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.status === 'READ_ONLY') {
      throw new ForbiddenException('Conversation is READ_ONLY');
    }

    const { role } = await this.conversationService.verifyAccess(conversation.allocationId, userId);

    let message = this.messageRepo.create({
      conversationId,
      senderId: userId,
      senderRole: role as MealMessageSenderRole,
      content,
      idempotencyKey: idempotencyKey || undefined,
    });

    try {
      message = await this.messageRepo.save(message);
    } catch (error) {
      if (error instanceof QueryFailedError && error.message.includes('unique constraint') && idempotencyKey) {
        const existing = await this.messageRepo.findOne({ where: { conversationId, idempotencyKey } });
        if (existing) {
          return existing;
        }
        throw new ConflictException('Idempotency error: could not fetch existing message');
      }
      throw error;
    }

    // Publish the event AFTER successful commit
    await this.eventPublisher.publishEvent('new_message', conversation.allocationId, message);

    return message;
  }

  async getMessages(conversationId: string, cursor?: string, limit: number = 50): Promise<MealMessage[]> {
    const query = this.messageRepo.createQueryBuilder('message')
      .where('message.conversationId = :conversationId', { conversationId })
      .orderBy('message.createdAt', 'ASC')
      .addOrderBy('message.id', 'ASC')
      .take(limit);

    if (cursor) {
      // Decode cursor assuming it is base64 encoded JSON { createdAt, id }
      let cursorData: { createdAt: string; id: string };
      try {
        cursorData = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
      } catch (e) {
        throw new BadRequestException('Invalid cursor');
      }
      
      query.andWhere(
        '(message.createdAt > :createdAt OR (message.createdAt = :createdAt AND message.id > :id))',
        { createdAt: cursorData.createdAt, id: cursorData.id }
      );
    }

    return query.getMany();
  }
}
