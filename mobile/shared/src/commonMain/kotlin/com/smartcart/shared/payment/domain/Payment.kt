package com.smartcart.shared.payment.domain

data class Payment(
    val paymentId: String,
    val providerOrderId: String?,
    val status: String,
    val paymentMethod: String
)
