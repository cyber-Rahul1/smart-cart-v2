package com.smartcart.shared.discovery.domain

data class Category(
    val id: String,
    val shopId: String,
    val name: String,
    val description: String?
)

data class Shop(
    val id: String,
    val ownerId: String,
    val name: String,
    val description: String?,
    val latitude: Double,
    val longitude: Double,
    val logo: String?,
    val banner: String?,
    val deliveryRadius: Int,
    val minimumOrder: Double,
    val preparationTime: Int,
    val status: String
)

data class Product(
    val id: String,
    val shopId: String,
    val categoryId: String,
    val name: String,
    val description: String?,
    val image: String?,
    val price: Double,
    val status: String,
    val version: Int
)

sealed class Resource<out T> {
    data class Success<out T>(val data: T, val isStale: Boolean = false) : Resource<T>()
    data class Error(val message: String, val exception: Exception? = null) : Resource<Nothing>()
    object Loading : Resource<Nothing>()
}

data class PaginatedData<T>(
    val items: List<T>,
    val page: Int,
    val limit: Int,
    val total: Int
)
