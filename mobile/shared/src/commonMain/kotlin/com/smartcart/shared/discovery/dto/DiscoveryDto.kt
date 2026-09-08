package com.smartcart.shared.discovery.dto

import kotlinx.serialization.Serializable

@Serializable
data class CategoryDto(
    val id: String,
    val shopId: String,
    val name: String,
    val description: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val deletedAt: String? = null
)

@Serializable
data class LocationDto(
    val type: String,
    val coordinates: List<Double>
)

@Serializable
data class ShopDto(
    val id: String,
    val ownerId: String,
    val name: String,
    val description: String? = null,
    val location: LocationDto,
    val logo: String? = null,
    val banner: String? = null,
    val deliveryRadius: Int,
    val minimumOrder: Double,
    val preparationTime: Int,
    val status: String,
    val createdAt: String,
    val updatedAt: String,
    val deletedAt: String? = null
)

@Serializable
data class ProductDto(
    val id: String,
    val shopId: String,
    val categoryId: String,
    val name: String,
    val description: String? = null,
    val image: String? = null,
    val price: Double,
    val status: String,
    val version: Int,
    val createdAt: String,
    val updatedAt: String,
    val deletedAt: String? = null
)

@Serializable
data class MetaDto(
    val page: Int? = null,
    val limit: Int? = null,
    val total: Int? = null
)

@Serializable
data class PaginatedResponseDto<T>(
    val success: Boolean,
    val data: List<T>,
    val meta: MetaDto
)

@Serializable
data class SingleResponseDto<T>(
    val success: Boolean,
    val data: T
)

@Serializable
data class ListResponseDto<T>(
    val success: Boolean,
    val data: List<T>
)
