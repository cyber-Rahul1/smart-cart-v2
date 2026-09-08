package com.smartcart.shared.discovery.repository

import com.smartcart.shared.cache.SmartCartDatabase
import com.smartcart.shared.discovery.api.DiscoveryService
import com.smartcart.shared.discovery.domain.Category
import com.smartcart.shared.discovery.domain.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.datetime.Clock

class CategoryRepository(
    private val api: DiscoveryService,
    private val db: SmartCartDatabase,
    private val clock: Clock = Clock.System
) {
    private val queries = db.databaseQueries
    private val ttlMillis = 24 * 60 * 60 * 1000L // 24 hours

    fun getCategories(shopId: String): Flow<Resource<List<Category>>> = flow {
        emit(Resource.Loading)
        val now = clock.now().toEpochMilliseconds()
        
        val cachedEntities = queries.getCategoriesByShopId(shopId).executeAsList()
        val isCacheValid = cachedEntities.isNotEmpty() && (now - cachedEntities.first().lastUpdated) < ttlMillis
        
        val cachedDomain = cachedEntities.map { 
            Category(it.id, it.shopId, it.name, it.description) 
        }

        if (isCacheValid) {
            emit(Resource.Success(cachedDomain))
            return@flow
        }

        try {
            val response = api.getCategories(shopId)
            
            queries.transaction {
                queries.deleteCategoriesByShopId(shopId)
                response.data.forEach { dto ->
                    queries.insertCategory(
                        id = dto.id,
                        shopId = dto.shopId,
                        name = dto.name,
                        description = dto.description,
                        createdAt = dto.createdAt,
                        updatedAt = dto.updatedAt,
                        deletedAt = dto.deletedAt,
                        lastUpdated = now
                    )
                }
            }
            
            val newCache = queries.getCategoriesByShopId(shopId).executeAsList().map {
                Category(it.id, it.shopId, it.name, it.description) 
            }
            emit(Resource.Success(newCache))
        } catch (e: Exception) {
            if (cachedDomain.isNotEmpty()) {
                emit(Resource.Success(cachedDomain, isStale = true))
            } else {
                emit(Resource.Error("Network error and no cache available", e))
            }
        }
    }
}
