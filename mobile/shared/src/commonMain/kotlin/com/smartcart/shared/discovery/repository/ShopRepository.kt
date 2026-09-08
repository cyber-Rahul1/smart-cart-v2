package com.smartcart.shared.discovery.repository

import com.smartcart.shared.cache.SmartCartDatabase
import com.smartcart.shared.discovery.api.DiscoveryService
import com.smartcart.shared.discovery.domain.PaginatedData
import com.smartcart.shared.discovery.domain.Resource
import com.smartcart.shared.discovery.domain.Shop
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.datetime.Clock

class ShopRepository(
    private val api: DiscoveryService,
    private val db: SmartCartDatabase,
    private val clock: Clock = Clock.System
) {
    private val queries = db.databaseQueries
    private val ttlMillis = 1 * 60 * 60 * 1000L // 1 hour

    fun getShopById(shopId: String): Flow<Resource<Shop>> = flow {
        emit(Resource.Loading)
        val now = clock.now().toEpochMilliseconds()
        
        val cachedEntity = queries.getShopById(shopId).executeAsOneOrNull()
        val isCacheValid = cachedEntity != null && (now - cachedEntity.lastUpdated) < ttlMillis
        
        val cachedDomain = cachedEntity?.let {
            Shop(it.id, it.ownerId, it.name, it.description, it.latitude, it.longitude, 
                 it.logo, it.banner, it.deliveryRadius.toInt(), it.minimumOrder, it.preparationTime.toInt(), it.status, it.publishedAt)
        }

        if (isCacheValid && cachedDomain != null) {
            emit(Resource.Success(cachedDomain))
            return@flow
        }

        try {
            val response = api.getShopById(shopId)
            val dto = response.data
            
            queries.insertShop(
                id = dto.id, ownerId = dto.ownerId, name = dto.name, description = dto.description,
                latitude = dto.location.coordinates[1], longitude = dto.location.coordinates[0],
                logo = dto.logo, banner = dto.banner, deliveryRadius = dto.deliveryRadius.toLong(),
                minimumOrder = dto.minimumOrder, preparationTime = dto.preparationTime.toLong(),
                status = dto.status, publishedAt = dto.publishedAt, createdAt = dto.createdAt, updatedAt = dto.updatedAt,
                deletedAt = dto.deletedAt, lastUpdated = now
            )
            
            val updatedEntity = queries.getShopById(shopId).executeAsOne()
            emit(Resource.Success(
                Shop(updatedEntity.id, updatedEntity.ownerId, updatedEntity.name, updatedEntity.description,
                     updatedEntity.latitude, updatedEntity.longitude, updatedEntity.logo, updatedEntity.banner,
                     updatedEntity.deliveryRadius.toInt(), updatedEntity.minimumOrder, updatedEntity.preparationTime.toInt(),
                     updatedEntity.status, updatedEntity.publishedAt)
            ))
        } catch (e: Exception) {
            if (cachedDomain != null) {
                emit(Resource.Success(cachedDomain, isStale = true))
            } else {
                emit(Resource.Error("Network error and no cache available", e))
            }
        }
    }

    fun getNearbyShops(lat: Double, lng: Double, radius: Int = 5000, page: Int = 1, limit: Int = 20): Flow<Resource<PaginatedData<Shop>>> = flow {
        emit(Resource.Loading)
        val now = clock.now().toEpochMilliseconds()
        
        val cacheKey = "nearby_${lat}_${lng}_${radius}_${page}_${limit}"
        val browseCache = queries.getBrowseCache(cacheKey).executeAsOneOrNull()
        val isCacheValid = browseCache != null && (now - browseCache.lastUpdated) < ttlMillis
        
        var cachedShops: List<Shop>? = null
        if (browseCache != null) {
            val ids = browseCache.ids.split(",")
            val entities = ids.mapNotNull { queries.getShopById(it).executeAsOneOrNull() }
            if (entities.size == ids.size) {
                cachedShops = entities.map {
                    Shop(it.id, it.ownerId, it.name, it.description, it.latitude, it.longitude, 
                         it.logo, it.banner, it.deliveryRadius.toInt(), it.minimumOrder, it.preparationTime.toInt(), it.status, it.publishedAt)
                }
            }
        }

        if (isCacheValid && cachedShops != null) {
            emit(Resource.Success(PaginatedData(cachedShops, page, limit, cachedShops.size)))
            return@flow
        }

        try {
            val response = api.getNearbyShops(lat, lng, radius, page, limit)
            
            queries.transaction {
                val ids = response.data.map { dto ->
                    queries.insertShop(
                        id = dto.id, ownerId = dto.ownerId, name = dto.name, description = dto.description,
                        latitude = dto.location.coordinates[1], longitude = dto.location.coordinates[0],
                        logo = dto.logo, banner = dto.banner, deliveryRadius = dto.deliveryRadius.toLong(),
                        minimumOrder = dto.minimumOrder, preparationTime = dto.preparationTime.toLong(),
                        status = dto.status, publishedAt = dto.publishedAt, createdAt = dto.createdAt, updatedAt = dto.updatedAt,
                        deletedAt = dto.deletedAt, lastUpdated = now
                    )
                    dto.id
                }
                queries.insertBrowseCache(cacheKey, ids.joinToString(","), now)
            }
            
            val domainShops = response.data.map { dto ->
                 Shop(dto.id, dto.ownerId, dto.name, dto.description, dto.location.coordinates[1], dto.location.coordinates[0], 
                      dto.logo, dto.banner, dto.deliveryRadius, dto.minimumOrder, dto.preparationTime, dto.status, dto.publishedAt)
            }
            emit(Resource.Success(PaginatedData(domainShops, response.meta.page ?: page, response.meta.limit ?: limit, response.meta.total ?: domainShops.size)))
        } catch (e: Exception) {
            if (cachedShops != null) {
                emit(Resource.Success(PaginatedData(cachedShops, page, limit, cachedShops.size), isStale = true))
            } else {
                emit(Resource.Error("Network error and no cache available", e))
            }
        }
    }

    fun getNewNearYou(lat: Double, lng: Double, radius: Int = 5000, limit: Int = 20, cursor: String? = null): Flow<Resource<PaginatedData<Shop>>> = flow {
        emit(Resource.Loading)
        val now = clock.now().toEpochMilliseconds()
        val qLat = (lat * 1000).toInt() / 1000.0
        val qLng = (lng * 1000).toInt() / 1000.0
        val safeCursor = cursor ?: "first"
        val cacheKey = "new_near_you_${qLat}_${qLng}_${radius}_${limit}_$safeCursor"
        val browseCache = queries.getBrowseCache(cacheKey).executeAsOneOrNull()
        
        val ttlMillisNewNearYou = 15 * 60 * 1000L
        val isCacheValid = browseCache != null && (now - browseCache.lastUpdated) < ttlMillisNewNearYou
        
        var cachedShops: List<Shop>? = null
        if (browseCache != null) {
            val ids = browseCache.ids.split(",")
            val entities = ids.mapNotNull { queries.getShopById(it).executeAsOneOrNull() }
            if (entities.size == ids.size) {
                cachedShops = entities.map {
                    Shop(it.id, it.ownerId, it.name, it.description, it.latitude, it.longitude, 
                         it.logo, it.banner, it.deliveryRadius.toInt(), it.minimumOrder, it.preparationTime.toInt(), it.status, it.publishedAt)
                }
            }
        }

        // Network-first strategy for new-near-you, but return cache if we fail
        try {
            val response = api.getNewNearYou(lat, lng, radius, limit, cursor)
            
            queries.transaction {
                val ids = response.data.map { dto ->
                    queries.insertShop(
                        id = dto.id, ownerId = dto.ownerId, name = dto.name, description = dto.description,
                        latitude = dto.location.coordinates[1], longitude = dto.location.coordinates[0],
                        logo = dto.logo, banner = dto.banner, deliveryRadius = dto.deliveryRadius.toLong(),
                        minimumOrder = dto.minimumOrder, preparationTime = dto.preparationTime.toLong(),
                        status = dto.status, publishedAt = dto.publishedAt, createdAt = dto.createdAt, updatedAt = dto.updatedAt,
                        deletedAt = dto.deletedAt, lastUpdated = now
                    )
                    dto.id
                }
                if (ids.isNotEmpty()) {
                    queries.insertBrowseCache(cacheKey, ids.joinToString(","), now)
                }
            }
            
            val domainShops = response.data.map { dto ->
                 Shop(dto.id, dto.ownerId, dto.name, dto.description, dto.location.coordinates[1], dto.location.coordinates[0], 
                      dto.logo, dto.banner, dto.deliveryRadius, dto.minimumOrder, dto.preparationTime, dto.status, dto.publishedAt)
            }
            emit(Resource.Success(PaginatedData(domainShops, 1, limit, domainShops.size, response.meta.nextCursor)))
        } catch (e: Exception) {
            if (cachedShops != null) {
                emit(Resource.Success(PaginatedData(cachedShops, 1, limit, cachedShops.size, cursor), isStale = true)) // fallback to same cursor
            } else {
                emit(Resource.Error("Network error and no cache available", e))
            }
        }
    }
}
