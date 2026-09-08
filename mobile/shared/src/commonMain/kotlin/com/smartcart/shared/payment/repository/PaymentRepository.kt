package com.smartcart.shared.payment.repository

import com.smartcart.shared.cart.repository.Resource
import com.smartcart.shared.payment.data.PaymentApi
import com.smartcart.shared.payment.domain.Payment

class PaymentRepository(private val api: PaymentApi) {
    suspend fun initiatePayment(orderId: String, paymentMethod: String, idempotencyKey: String): Resource<Payment> {
        return try {
            val response = api.initiatePayment(orderId, paymentMethod, idempotencyKey)
            Resource.Success(
                Payment(
                    paymentId = response.paymentId,
                    providerOrderId = response.providerOrderId,
                    status = response.status,
                    paymentMethod = response.paymentMethod
                )
            )
        } catch (e: Exception) {
            Resource.Error(e)
        }
    }
}
