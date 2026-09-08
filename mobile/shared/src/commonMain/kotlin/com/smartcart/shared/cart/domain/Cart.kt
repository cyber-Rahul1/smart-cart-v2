package com.smartcart.shared.cart.domain

data class CartShop(
    val id: String,
    val name: String,
    val minimumOrder: String
)

data class CartItem(
    val id: String,
    val productId: String,
    val name: String,
    val image: String?,
    val quantity: Int,
    val unitPrice: String,
    val lineTotal: String,
    val isAvailable: Boolean,
    val status: String
)

data class Cart(
    val id: String?,
    val shop: CartShop?,
    val items: List<CartItem>,
    val subtotal: String,
    val minimumOrder: String,
    val remainingAmount: String,
    val itemCount: Int,
    val totalQuantity: Int
)

class CartShopConflictError(message: String = "Cart contains items from a different shop. Clear your cart first.") : Exception(message)
