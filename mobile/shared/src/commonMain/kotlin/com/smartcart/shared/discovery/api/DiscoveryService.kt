package com.smartcart.shared.discovery.api

import com.smartcart.shared.discovery.dto.CategoryDto
import com.smartcart.shared.discovery.dto.ListResponseDto
import com.smartcart.shared.discovery.dto.PaginatedResponseDto
import com.smartcart.shared.discovery.dto.ProductDto
import com.smartcart.shared.discovery.dto.ShopDto
import com.smartcart.shared.discovery.dto.SingleResponseDto
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter

class DiscoveryService(private val client: HttpClient, private val baseUrl: String) {

    suspend fun getNearbyShops(
        lat: Double,
        lng: Double,
        radius: Int = 5000,
        page: Int = 1,
        limit: Int = 20
    ): PaginatedResponseDto<ShopDto> {
        return client.get("$baseUrl/shops") {
            parameter("lat", lat)
            parameter("lng", lng)
            parameter("radius", radius)
            parameter("page", page)
            parameter("limit", limit)
        }.body()
    }

    suspend fun getShopById(shopId: String): SingleResponseDto<ShopDto> {
        return client.get("$baseUrl/shops/$shopId").body()
    }

    suspend fun getCategories(shopId: String): ListResponseDto<CategoryDto> {
        return client.get("$baseUrl/shops/$shopId/categories").body()
    }

    suspend fun getProducts(shopId: String): ListResponseDto<ProductDto> {
        return client.get("$baseUrl/shops/$shopId/products").body()
    }
}
