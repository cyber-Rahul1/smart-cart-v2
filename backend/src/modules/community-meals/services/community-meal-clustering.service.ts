import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { CommunityMealRequest } from '../entities/community-meal-request.entity.js';
import { CommunityMealCluster } from '../entities/community-meal-cluster.entity.js';
import { CommunityMealRequestStatus } from '../enums/community-meal-request-status.enum.js';
import { CommunityMealClusterStatus } from '../enums/community-meal-cluster-status.enum.js';

@Injectable()
export class CommunityMealClusteringService {
  private readonly logger = new Logger(CommunityMealClusteringService.name);

  constructor(
    @InjectRepository(CommunityMealCluster)
    private readonly clusterRepo: Repository<CommunityMealCluster>,
    @InjectRepository(CommunityMealRequest)
    private readonly requestRepo: Repository<CommunityMealRequest>,
    private readonly dataSource: DataSource,
  ) {}

  async clusterRequest(requestId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(CommunityMealRequest, { where: { id: requestId } });
      if (!request) return; // Deleted

      if (request.status !== CommunityMealRequestStatus.SEARCHING) {
        return; // Already clustered, cancelled, or expired
      }

      // Find compatible clusters
      // 1. Same cuisine
      // 2. Same mealType
      // 3. Same dietaryRestrictions
      // 4. Same spiceLevel
      // 5. 45 min overlap
      // 6. Within 2000m
      // 7. Not expired/cancelled
      
      const compatibleClusters: CommunityMealCluster[] = await manager.query(`
        SELECT c.*
        FROM community_meal_clusters c
        WHERE c.status IN ($1, $2)
          AND c.cuisine = $3
          AND c."mealType" = $4
          AND (c."dietaryRestrictions" = $5 OR (c."dietaryRestrictions" IS NULL AND $5::text IS NULL))
          AND (c."spiceLevel" = $6 OR (c."spiceLevel" IS NULL AND $6::text IS NULL))
          AND ST_DWithin(c.centroid, ST_SetSRID(ST_GeomFromGeoJSON($7::json), 4326)::geography, 2000)
          AND GREATEST(c."timeWindowStart", $8::timestamptz) <= LEAST(c."timeWindowEnd", $9::timestamptz) - interval '45 minutes'
        ORDER BY c."timeWindowStart" ASC
      `, [
        CommunityMealClusterStatus.GATHERING_DEMAND,
        CommunityMealClusterStatus.OFFERING,
        request.cuisine,
        request.mealType,
        request.dietaryRestrictions || null,
        request.spiceLevel || null,
        JSON.stringify(request.location),
        request.timeWindowStart.toISOString(),
        request.timeWindowEnd.toISOString(),
      ]);

      let targetClusterId: string;

      if (compatibleClusters.length > 0) {
        // Lock the chosen cluster
        const chosenCluster = compatibleClusters[0];
        targetClusterId = chosenCluster.id;
        
        await manager.query(`
          SELECT 1 FROM community_meal_clusters WHERE id = $1 FOR UPDATE
        `, [targetClusterId]);
      } else {
        // Create new cluster
        const newCluster = manager.create(CommunityMealCluster, {
          centroid: request.location,
          timeWindowStart: request.timeWindowStart,
          timeWindowEnd: request.timeWindowEnd,
          cuisine: request.cuisine,
          mealType: request.mealType,
          dietaryRestrictions: request.dietaryRestrictions,
          spiceLevel: request.spiceLevel,
          status: CommunityMealClusterStatus.GATHERING_DEMAND,
          minimumThreshold: 3,
        });
        const savedCluster = await manager.save(newCluster);
        targetClusterId = savedCluster.id;
      }

      // Assign request
      request.clusterId = targetClusterId;
      
      // We don't automatically mark request OFFERING here, we do it below when threshold is met
      await manager.save(request);

      // Re-evaluate cluster active count
      await this.reevaluateClusterInsideTransaction(manager, targetClusterId);
    });
  }

  async reevaluateCluster(clusterId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`
        SELECT 1 FROM community_meal_clusters WHERE id = $1 FOR UPDATE
      `, [clusterId]);

      await this.reevaluateClusterInsideTransaction(manager, clusterId);
    });
  }

  private async reevaluateClusterInsideTransaction(manager: any, clusterId: string): Promise<void> {
    const cluster = await manager.findOne(CommunityMealCluster, { where: { id: clusterId } });
    if (!cluster) return;

    if (cluster.status === CommunityMealClusterStatus.EXPIRED || cluster.status === CommunityMealClusterStatus.CANCELLED) {
      return; // Terminal
    }

    const activeCountStr = await manager.query(`
      SELECT COUNT(*) as count 
      FROM community_meal_requests 
      WHERE "clusterId" = $1 
      AND status IN ($2, $3)
    `, [clusterId, CommunityMealRequestStatus.SEARCHING, CommunityMealRequestStatus.OFFERING]);
    
    const activeCount = parseInt(activeCountStr[0].count, 10);

    let nextClusterStatus = cluster.status;
    let nextRequestStatus: CommunityMealRequestStatus | null = null;

    if (activeCount >= cluster.minimumThreshold) {
      if (cluster.status === CommunityMealClusterStatus.GATHERING_DEMAND) {
        nextClusterStatus = CommunityMealClusterStatus.OFFERING;
      }
      nextRequestStatus = CommunityMealRequestStatus.OFFERING;
    } else {
      if (cluster.status === CommunityMealClusterStatus.OFFERING) {
        nextClusterStatus = CommunityMealClusterStatus.GATHERING_DEMAND;
      }
      nextRequestStatus = CommunityMealRequestStatus.SEARCHING;
    }

    if (cluster.status !== nextClusterStatus) {
      cluster.status = nextClusterStatus;
      await manager.save(cluster);
    }

    if (nextRequestStatus) {
      // Update all active requests in this cluster
      await manager.query(`
        UPDATE community_meal_requests 
        SET status = $1 
        WHERE "clusterId" = $2 
        AND status IN ($3, $4)
      `, [nextRequestStatus, clusterId, CommunityMealRequestStatus.SEARCHING, CommunityMealRequestStatus.OFFERING]);
    }
  }

  // Pagination Encoding/Decoding
  private encodeCursor(distance: number, clusterId: string): string {
    return Buffer.from(JSON.stringify({ distance, clusterId })).toString('base64');
  }

  private decodeCursor(cursor: string): { distance: number; clusterId: string } {
    let decodedString: string;
    try {
      decodedString = Buffer.from(cursor, 'base64').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor encoding');
    }

    let decoded: any;
    try {
      decoded = JSON.parse(decodedString);
    } catch {
      throw new BadRequestException('Invalid cursor format');
    }

    if (!decoded || typeof decoded !== 'object') {
      throw new BadRequestException('Invalid cursor structure');
    }

    if (typeof decoded.distance !== 'number' || !Number.isFinite(decoded.distance) || decoded.distance < 0) {
      throw new BadRequestException('Invalid cursor distance');
    }

    if (typeof decoded.clusterId !== 'string' || decoded.clusterId.trim() === '') {
      throw new BadRequestException('Invalid cursor clusterId');
    }

    return {
      distance: decoded.distance,
      clusterId: decoded.clusterId,
    };
  }

  async getNearbyClusters(lat: number, lng: number, limit: number, cursor?: string) {
    const pointStr = JSON.stringify({ type: 'Point', coordinates: [lng, lat] });
    
    let query = this.clusterRepo.createQueryBuilder('c')
      .select('c.id', 'id')
      .addSelect('c.cuisine', 'cuisine')
      .addSelect('c."mealType"', 'mealType')
      .addSelect('c.timeWindowStart', 'timeWindowStart')
      .addSelect('c.timeWindowEnd', 'timeWindowEnd')
      .addSelect('ST_AsGeoJSON(c.centroid)::json', 'approximateLocation')
      .addSelect(`ST_Distance(c.centroid, ST_SetSRID(ST_GeomFromGeoJSON(:point), 4326)::geography)`, 'distance')
      .addSelect(`(SELECT COUNT(*) FROM community_meal_requests r WHERE r."clusterId" = c.id AND r.status IN (:...statuses))::int`, 'demandCount')
      .where(`ST_DWithin(c.centroid, ST_SetSRID(ST_GeomFromGeoJSON(:point), 4326)::geography, 2000)`)
      .andWhere('c.status IN (:...clusterStatuses)', { 
        clusterStatuses: [CommunityMealClusterStatus.GATHERING_DEMAND, CommunityMealClusterStatus.OFFERING] 
      })
      .setParameters({ 
        point: pointStr,
        statuses: [CommunityMealRequestStatus.SEARCHING, CommunityMealRequestStatus.OFFERING],
      });

    if (cursor) {
      const { distance, clusterId } = this.decodeCursor(cursor);
      query = query.andWhere(`
        (ST_Distance(c.centroid, ST_SetSRID(ST_GeomFromGeoJSON(:point), 4326)::geography) > :cursorDistance) OR 
        (ST_Distance(c.centroid, ST_SetSRID(ST_GeomFromGeoJSON(:point), 4326)::geography) = :cursorDistance AND c.id > :cursorId)
      `, {
        cursorDistance: distance,
        cursorId: clusterId,
      });
    }

    query = query.orderBy('distance', 'ASC').addOrderBy('c.id', 'ASC').limit(limit);

    const rawResults = await query.getRawMany();

    const clusters = rawResults.map(row => ({
      id: row.id,
      demandCount: row.demandCount,
      cuisine: row.cuisine,
      mealType: row.mealType,
      timeWindowStart: row.timeWindowStart.toISOString(),
      timeWindowEnd: row.timeWindowEnd.toISOString(),
      approximateLocation: {
        lat: row.approximateLocation.coordinates[1],
        lng: row.approximateLocation.coordinates[0],
      },
      distance: parseFloat(row.distance),
    }));

    let nextCursor = null;
    if (clusters.length === limit) {
      const last = clusters[clusters.length - 1];
      nextCursor = this.encodeCursor(last.distance, last.id);
    }

    return { clusters, nextCursor };
  }
}
