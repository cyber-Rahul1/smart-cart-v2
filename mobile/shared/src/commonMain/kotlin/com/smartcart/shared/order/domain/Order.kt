package com.smartcart.shared.order.domain

data class Order(
    val id: String,
    val shopId: String,
    val status: OrderStatus,
    val subtotal: String,
    val deliveryFee: String,
    val totalAmount: String,
    val deliveryAddressLabel: String,
    val deliveryAddressLine: String,
    val createdAt: String,
    val deliveryId: String?,
    val items: List<OrderItem>? = null
)

data class OrderItem(
    val id: String,
    val productId: String?,
    val productName: String,
    val unitPrice: String,
    val quantity: Int,
    val lineTotal: String
)
