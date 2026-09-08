package com.smartcart.shared.cart.data

import com.smartcart.shared.core.ExactMoneySerializer
import kotlinx.serialization.Serializable

@Serializable
data class CartShopDto(
    val id: String,
    val name: String,
    @Serializable(with = ExactMoneySerializer::class)
    val minimumOrder: String
)

@Serializable
data class CartItemDto(
    val id: String,
    val productId: String,
    val name: String,
    val image: String?,
    val quantity: Int,
    @Serializable(with = ExactMoneySerializer::class)
    val unitPrice: String,
    @Serializable(with = ExactMoneySerializer::class)
    val lineTotal: String,
    val isAvailable: Boolean,
    val status: String
)

@Serializable
data class CartDto(
    val id: String?,
    val shop: CartShopDto?,
    val items: List<CartItemDto>,
    @Serializable(with = ExactMoneySerializer::class)
    val subtotal: String,
    @Serializable(with = ExactMoneySerializer::class)
    val minimumOrder: String,
    @Serializable(with = ExactMoneySerializer::class)
    val remainingAmount: String,
    val itemCount: Int,
    val totalQuantity: Int
)

@Serializable
data class AddToCartDto(
    val productId: String,
    val quantity: Int
)

@Serializable
data class UpdateCartItemDto(
    val quantity: Int
)

@Serializable
data class CartResponseDto(
    val success: Boolean,
    val data: CartDto
)
