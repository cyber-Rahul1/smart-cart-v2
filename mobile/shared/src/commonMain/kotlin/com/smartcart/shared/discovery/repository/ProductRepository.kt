package com.smartcart.shared.discovery.repository

import com.smartcart.shared.cache.SmartCartDatabase
import com.smartcart.shared.discovery.api.DiscoveryService
import com.smartcart.shared.discovery.domain.Product
import com.smartcart.shared.discovery.domain.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.datetime.Clock

class ProductRepository(
    private val api: DiscoveryService,
    private val db: SmartCartDatabase,
    private val clock: Clock = Clock.System
) {
    private val queries = db.databaseQueries
    private val ttlMillis = 1 * 60 * 60 * 1000L // 1 hour

    fun getProducts(shopId: String): Flow<Resource<List<Product>>> = flow {
        emit(Resource.Loading)
        val now = clock.now().toEpochMilliseconds()
        
        val cachedEntities = queries.getProductsByShopId(shopId).executeAsList()
        val isCacheValid = cachedEntities.isNotEmpty() && (now - cachedEntities.first().lastUpdated) < ttlMillis
        
        val cachedDomain = cachedEntities.map { 
            Product(it.id, it.shopId, it.categoryId, it.name, it.description, it.image, it.price, it.status, it.version.toInt()) 
        }

        if (isCacheValid) {
            emit(Resource.Success(cachedDomain))
            return@flow
        }

        try {
            val response = api.getProducts(shopId)
            
            queries.transaction {
                queries.deleteProductsByShopId(shopId)
                response.data.forEach { dto ->
                    queries.insertProduct(
                        id = dto.id,
                        shopId = dto.shopId,
                        categoryId = dto.categoryId,
                        name = dto.name,
                        description = dto.description,
                        image = dto.image,
                        price = dto.price,
                        status = dto.status,
                        version = dto.version.toLong(),
                        createdAt = dto.createdAt,
                        updatedAt = dto.updatedAt,
                        deletedAt = dto.deletedAt,
                        lastUpdated = now
                    )
                }
            }
            
            val newCache = queries.getProductsByShopId(shopId).executeAsList().map {
                Product(it.id, it.shopId, it.categoryId, it.name, it.description, it.image, it.price, it.status, it.version.toInt()) 
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
