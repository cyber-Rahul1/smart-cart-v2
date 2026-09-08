package com.smartcart.shared.checkout.domain

data class CheckoutQuote(
    val quoteId: String,
    val generatedAt: String,
    val cartId: String,
    val subtotal: String,
    val minimumOrderSatisfied: Boolean,
    val deliveryEligible: Boolean,
    val validationErrors: List<Pair<String, String>>
)
