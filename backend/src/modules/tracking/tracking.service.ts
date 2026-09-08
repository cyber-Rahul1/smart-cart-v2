import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

const LUA_UPDATE_LOCATION = `
local riderId = KEYS[1]
local hashKey = 'rider:location:' .. riderId
local geoKey = 'rider:locations:geo'

local newLat = tonumber(ARGV[1])
local newLng = tonumber(ARGV[2])
local newRiderTimestamp = tonumber(ARGV[3])
local serverTimestamp = tonumber(ARGV[4])
local deliveryId = ARGV[5]
local maxSpeedKmh = tonumber(ARGV[6])

local existing = redis.call('HGETALL', hashKey)
local existingRiderTimestamp = 0
local existingLat = nil
local existingLng = nil

if #existing > 0 then
  for i=1, #existing, 2 do
    if existing[i] == 'riderTimestamp' then
      existingRiderTimestamp = tonumber(existing[i+1])
    elseif existing[i] == 'lat' then
      existingLat = tonumber(existing[i+1])
    elseif existing[i] == 'lng' then
      existingLng = tonumber(existing[i+1])
    end
  end
end

-- Reject if new timestamp is older or equal
if newRiderTimestamp <= existingRiderTimestamp then
  return -1 -- INDICATES_STALE_OR_DUPLICATE
end

-- If there's a previous location, check speed
if existingLat ~= nil and existingLng ~= nil then
  -- Haversine formula approximation for jump distance
  local R = 6371 -- Earth radius in km
  local dLat = (newLat - existingLat) * math.pi / 180
  local dLng = (newLng - existingLng) * math.pi / 180
  local a = math.sin(dLat/2) * math.sin(dLat/2) +
            math.cos(existingLat * math.pi / 180) * math.cos(newLat * math.pi / 180) *
            math.sin(dLng/2) * math.sin(dLng/2)
  local c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
  local distanceKm = R * c
  
  local timeHours = (newRiderTimestamp - existingRiderTimestamp) / (1000 * 60 * 60)
  
  if timeHours > 0 then
    local speedKmh = distanceKm / timeHours
    if speedKmh > maxSpeedKmh then
      return -2 -- INDICATES_IMPOSSIBLE_JUMP
    end
  end
end

-- Validation passed, perform atomic write
redis.call('HSET', hashKey, 
  'riderId', riderId,
  'lat', newLat,
  'lng', newLng,
  'riderTimestamp', newRiderTimestamp,
  'serverTimestamp', serverTimestamp,
  'deliveryId', deliveryId
)

redis.call('EXPIRE', hashKey, 300) -- 5 minutes TTL
redis.call('GEOADD', geoKey, newLng, newLat, riderId)

return 1 -- INDICATES_SUCCESS
`;

export interface LocationPayload {
  riderId: string;
  lat: number;
  lng: number;
  riderTimestamp: number;
  deliveryId?: string;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly MAX_SPEED_KMH = 150;
  private readonly GEO_KEY = 'rider:locations:geo';

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  /**
   * Atomically validates and updates the rider's latest location.
   */
  async updateLocation(payload: LocationPayload): Promise<'SUCCESS' | 'STALE' | 'JUMP_REJECTED'> {
    const { riderId, lat, lng, riderTimestamp, deliveryId } = payload;
    const serverTimestamp = Date.now();

    const result = await this.redis.eval(
      LUA_UPDATE_LOCATION,
      1, // Number of keys
      riderId, // KEYS[1]
      lat.toString(),
      lng.toString(),
      riderTimestamp.toString(),
      serverTimestamp.toString(),
      deliveryId || '',
      this.MAX_SPEED_KMH.toString(),
    );

    if (result === -1) return 'STALE';
    if (result === -2) return 'JUMP_REJECTED';
    
    // Broadcast the update (Pub/Sub)
    if (result === 1 && deliveryId) {
      await this.redis.publish(
        `delivery:${deliveryId}:location`,
        JSON.stringify(payload)
      );
    }
    
    return 'SUCCESS';
  }

  /**
   * Cleans up stale GEO members whose Hash has expired.
   */
  async cleanupStaleGeo(): Promise<void> {
    const riderIds = await this.redis.zrange(this.GEO_KEY, 0, -1);
    if (!riderIds.length) return;

    let removed = 0;
    // Process in batches if there are many riders, or pipeline
    const pipeline = this.redis.pipeline();
    
    for (const riderId of riderIds) {
      pipeline.exists(`rider:location:${riderId}`);
    }
    
    const results = await pipeline.exec();
    const toRemove: string[] = [];
    
    if (results) {
      results.forEach(([err, exists], index) => {
        if (!err && exists === 0) {
          toRemove.push(riderIds[index]);
        }
      });
    }

    if (toRemove.length > 0) {
      await this.redis.zrem(this.GEO_KEY, ...toRemove);
      removed = toRemove.length;
    }

    this.logger.debug(`Geo cleanup removed ${removed} stale riders`);
  }

  /**
   * Gets latest location Hash for sampling
   */
  async getLatestLocation(riderId: string): Promise<any> {
    const hash = await this.redis.hgetall(`rider:location:${riderId}`);
    if (Object.keys(hash).length === 0) return null;
    return {
      riderId: hash.riderId,
      lat: parseFloat(hash.lat),
      lng: parseFloat(hash.lng),
      riderTimestamp: parseInt(hash.riderTimestamp, 10),
      serverTimestamp: parseInt(hash.serverTimestamp, 10),
      deliveryId: hash.deliveryId || null,
    };
  }
}
