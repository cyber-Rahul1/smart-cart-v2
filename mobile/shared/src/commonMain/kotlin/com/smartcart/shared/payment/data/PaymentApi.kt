package com.smartcart.shared.payment.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType

class PaymentApi(private val client: HttpClient) {
    suspend fun initiatePayment(orderId: String, paymentMethod: String, idempotencyKey: String): PaymentResponseDto {
        return client.post("/orders/${orderId}/payment") {
            contentType(ContentType.Application.Json)
            header("x-idempotency-key", idempotencyKey)
            setBody(InitiatePaymentDto(paymentMethod))
        }.body()
    }
}
