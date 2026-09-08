package com.smartcart.shared.payment.data

import kotlinx.serialization.Serializable

@Serializable
data class InitiatePaymentDto(
    val paymentMethod: String
)

@Serializable
data class PaymentResponseDto(
    val paymentId: String,
    val providerOrderId: String?,
    val status: String,
    val paymentMethod: String
)
