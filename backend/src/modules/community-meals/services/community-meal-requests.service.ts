import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DeepPartial } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CommunityMealRequest } from '../entities/community-meal-request.entity.js';
import { CreateCommunityMealRequestDto } from '../dto/create-community-meal-request.dto.js';
import { CommunityMealRequestStatus } from '../enums/community-meal-request-status.enum.js';

@Injectable()
export class CommunityMealRequestsService {
  constructor(
    @InjectRepository(CommunityMealRequest)
    private readonly requestRepo: Repository<CommunityMealRequest>,
    @InjectQueue('community-meals-clustering')
    private readonly clusteringQueue: Queue,
    @InjectQueue('community-meals-expiration')
    private readonly expirationQueue: Queue,
  ) {}

  async createRequest(userId: string, dto: CreateCommunityMealRequestDto): Promise<CommunityMealRequest> {
    if (new Date(dto.timeWindowStart) >= new Date(dto.timeWindowEnd)) {
      throw new BadRequestException('timeWindowStart must be before timeWindowEnd');
    }
    if (dto.budgetMin > dto.budgetMax) {
      throw new BadRequestException('budgetMin cannot be greater than budgetMax');
    }

    // Check for existing active requests
    const activeRequest = await this.requestRepo.findOne({
      where: {
        userId,
        status: In([CommunityMealRequestStatus.SEARCHING, CommunityMealRequestStatus.OFFERING, CommunityMealRequestStatus.CONFIRMED]),
      },
    });

    if (activeRequest) {
      throw new ConflictException('You already have an active community meal request.');
    }

    const expiresAt = new Date(dto.timeWindowStart);
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('timeWindowStart must be in the future');
    }

    const request = this.requestRepo.create({
      userId,
      location: {
        type: 'Point',
        coordinates: [dto.lng, dto.lat],
      },
      mealType: dto.mealType,
      cuisine: dto.cuisine,
      budgetMin: dto.budgetMin,
      budgetMax: dto.budgetMax,
      timeWindowStart: new Date(dto.timeWindowStart),
      timeWindowEnd: new Date(dto.timeWindowEnd),
      dietaryRestrictions: dto.dietaryRestrictions || null,
      spiceLevel: dto.spiceLevel || null,
      status: CommunityMealRequestStatus.SEARCHING,
      expiresAt,
    } as DeepPartial<CommunityMealRequest>);

    await this.requestRepo.save(request);

    // Enqueue clustering job
    await this.clusteringQueue.add(
      'cluster-request',
      { requestId: request.id },
      {
        jobId: `clustering:request:${request.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }
    );

    // Enqueue expiration job
    const delay = expiresAt.getTime() - Date.now();
    await this.expirationQueue.add(
      'expire-request',
      { requestId: request.id },
      {
        jobId: `expiration:request:${request.id}`,
        delay: delay > 0 ? delay : 0,
      }
    );

    return request;
  }

  async getRequest(id: string, userId: string): Promise<CommunityMealRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.userId !== userId) {
      throw new ForbiddenException('You do not own this request');
    }
    return request;
  }

  async cancelRequest(id: string, userId: string): Promise<CommunityMealRequest> {
    const request = await this.getRequest(id, userId);
    
    if (request.status !== CommunityMealRequestStatus.SEARCHING && request.status !== CommunityMealRequestStatus.OFFERING) {
      throw new BadRequestException('Cannot cancel request in current state');
    }

    request.status = CommunityMealRequestStatus.CANCELLED;
    await this.requestRepo.save(request);

    // If it was clustered, we need to enqueue a job to recalculate the cluster's active count, 
    // or we can do it inline since cancellation is less frequent. For 12B-2, since we need to evaluate OFFERING -> GATHERING_DEMAND,
    // we can do it in the clustering service, but let's just trigger a re-eval job or run inline.
    if (request.clusterId) {
      await this.clusteringQueue.add(
        'reevaluate-cluster',
        { clusterId: request.clusterId },
        { jobId: `reevaluate:cluster:${request.clusterId}:${Date.now()}` }
      );
    }

    return request;
  }
}
