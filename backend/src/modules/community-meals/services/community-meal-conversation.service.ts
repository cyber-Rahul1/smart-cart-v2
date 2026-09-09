import { Injectable, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { MealConversation } from '../entities/meal-conversation.entity.js';
import { MealAllocation } from '../entities/meal-allocation.entity.js';

@Injectable()
export class CommunityMealConversationService {
  constructor(
    @InjectRepository(MealConversation)
    private readonly conversationRepo: Repository<MealConversation>,
    @InjectRepository(MealAllocation)
    private readonly allocationRepo: Repository<MealAllocation>,
  ) {}

  async getOrCreateConversation(allocationId: string, userId: string): Promise<MealConversation> {
    const allocation = await this.allocationRepo.findOne({
      where: { id: allocationId },
      relations: { offer: { shop: true } } as any,
    });

    if (!allocation) {
      throw new NotFoundException('Allocation not found');
    }

    const isCustomer = userId === allocation.userId;
    const isShopkeeper = userId === allocation.offer.shop.ownerId;

    if (!isCustomer && !isShopkeeper) {
      throw new ForbiddenException('Unauthorized to access this conversation');
    }

    let conversation = await this.conversationRepo.findOne({ where: { allocationId } });

    if (!conversation) {
      try {
        conversation = this.conversationRepo.create({
          allocationId,
          status: 'ACTIVE',
        });
        await this.conversationRepo.save(conversation);
      } catch (error) {
        if (error instanceof QueryFailedError && error.message.includes('unique constraint')) {
          conversation = await this.conversationRepo.findOne({ where: { allocationId } });
          if (!conversation) {
            throw new ConflictException('Failed to retrieve conversation after concurrent creation');
          }
        } else {
          throw error;
        }
      }
    }

    return conversation;
  }

  async verifyAccess(allocationId: string, userId: string): Promise<{ role: 'CUSTOMER' | 'SHOPKEEPER' }> {
    const allocation = await this.allocationRepo.findOne({
      where: { id: allocationId },
      relations: { offer: { shop: true } } as any,
    });

    if (!allocation) {
      throw new NotFoundException('Allocation not found');
    }

    if (userId === allocation.userId) {
      return { role: 'CUSTOMER' };
    }

    if (userId === allocation.offer.shop.ownerId) {
      return { role: 'SHOPKEEPER' };
    }

    throw new ForbiddenException('Unauthorized to access this conversation');
  }
}
