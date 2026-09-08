package com.smartcart.shared.payment

sealed class PaymentResult {
    object Success : PaymentResult()
    data class Error(val reason: String) : PaymentResult()
    object Cancelled : PaymentResult()
}

interface PaymentProcessor {
    suspend fun processPayment(providerOrderId: String): PaymentResult
}
