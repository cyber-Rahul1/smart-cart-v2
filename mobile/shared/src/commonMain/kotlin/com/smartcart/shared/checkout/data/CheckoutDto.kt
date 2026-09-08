package com.smartcart.shared.checkout.data

import com.smartcart.shared.core.ExactMoneySerializer
import kotlinx.serialization.Serializable

@Serializable
data class CheckoutPreviewRequestDto(
    val addressId: String
)

@Serializable
data class CheckoutQuoteShopDto(
    val id: String,
    val name: String,
    @Serializable(with = ExactMoneySerializer::class)
    val minimumOrder: String,
    val deliveryRadius: Double
)

@Serializable
data class CheckoutQuoteAddressDto(
    val id: String,
    val label: String,
    val distanceMeters: Double
)

@Serializable
data class CheckoutQuoteItemDto(
    val productId: String,
    val name: String,
    val quantity: Int,
    @Serializable(with = ExactMoneySerializer::class)
    val unitPrice: String,
    @Serializable(with = ExactMoneySerializer::class)
    val lineTotal: String,
    val isAvailable: Boolean
)

@Serializable
data class CheckoutQuoteValidationErrorDto(
    val code: String,
    val message: String
)

@Serializable
data class CheckoutQuoteDto(
    val quoteId: String,
    val generatedAt: String,
    val cartId: String,
    val shop: CheckoutQuoteShopDto,
    val address: CheckoutQuoteAddressDto,
    val items: List<CheckoutQuoteItemDto>,
    @Serializable(with = ExactMoneySerializer::class)
    val subtotal: String,
    val minimumOrderSatisfied: Boolean,
    val deliveryEligible: Boolean,
    val validationErrors: List<CheckoutQuoteValidationErrorDto>? = null
)
