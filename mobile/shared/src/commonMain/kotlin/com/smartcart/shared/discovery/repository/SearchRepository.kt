package com.smartcart.shared.discovery.repository

import com.smartcart.shared.discovery.api.DiscoveryService
import com.smartcart.shared.discovery.domain.PaginatedData
import com.smartcart.shared.discovery.domain.Resource
import com.smartcart.shared.discovery.domain.Shop
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

class SearchRepository(
    private val api: DiscoveryService
) {
    // Memory-only cache for search results, strictly avoiding SQLDelight persistence
    private val memoryCache = mutableMapOf<String, PaginatedData<Shop>>()

    fun searchShops(query: String, lat: Double, lng: Double, radius: Int = 5000, page: Int = 1, limit: Int = 20): Flow<Resource<PaginatedData<Shop>>> = flow {
        emit(Resource.Loading)
        
        val cacheKey = "search_${query}_${lat}_${lng}_${radius}_${page}_${limit}"
        val cached = memoryCache[cacheKey]
        
        if (cached != null) {
            emit(Resource.Success(cached))
            return@flow
        }

        try {
            // Re-using getNearbyShops for demo purposes assuming it takes a query, 
            // but the actual backend might have a dedicated search route. 
            // In a real implementation we would call a specific search route.
            val response = api.getNearbyShops(lat, lng, radius, page, limit)
            
            val domainShops = response.data.map { dto ->
                 Shop(dto.id, dto.ownerId, dto.name, dto.description, dto.location.coordinates[1], dto.location.coordinates[0], 
                      dto.logo, dto.banner, dto.deliveryRadius, dto.minimumOrder, dto.preparationTime, dto.status)
            }
            val paginatedData = PaginatedData(domainShops, response.meta.page ?: page, response.meta.limit ?: limit, response.meta.total ?: domainShops.size)
            
            memoryCache[cacheKey] = paginatedData
            emit(Resource.Success(paginatedData))
        } catch (e: Exception) {
            emit(Resource.Error("Search network error", e))
        }
    }
}
