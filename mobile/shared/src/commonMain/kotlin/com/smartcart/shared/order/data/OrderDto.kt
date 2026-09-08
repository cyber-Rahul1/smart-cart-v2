package com.smartcart.shared.order.data

import com.smartcart.shared.core.ExactMoneySerializer
import kotlinx.serialization.Serializable

@Serializable
data class CreateOrderDto(
    val addressId: String,
    val idempotencyKey: String
)

@Serializable
data class OrderItemResponseDto(
    val id: String,
    val productId: String?,
    val productNameSnapshot: String,
    @Serializable(with = ExactMoneySerializer::class)
    val unitPriceSnapshot: String,
    val quantity: Int,
    @Serializable(with = ExactMoneySerializer::class)
    val lineTotal: String
)

@Serializable
data class OrderResponseDto(
    val id: String,
    val shopId: String,
    val status: String,
    @Serializable(with = ExactMoneySerializer::class)
    val subtotal: String,
    @Serializable(with = ExactMoneySerializer::class)
    val deliveryFee: String,
    @Serializable(with = ExactMoneySerializer::class)
    val totalAmount: String,
    val deliveryAddressLabel: String,
    val deliveryAddressLine: String,
    val cancellationReason: String?,
    val cancelledAt: String?,
    val createdAt: String,
    val updatedAt: String,
    val items: List<OrderItemResponseDto>? = null,
    val deliveryId: String? = null
)

@Serializable
data class OrderSuccessResponseDto(
    val success: Boolean,
    val data: OrderResponseDto
)

@Serializable
data class OrdersSuccessResponseDto(
    val success: Boolean,
    val data: List<OrderResponseDto>
)
