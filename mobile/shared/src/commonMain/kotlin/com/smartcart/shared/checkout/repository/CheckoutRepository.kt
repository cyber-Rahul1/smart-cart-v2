package com.smartcart.shared.checkout.repository

import com.smartcart.shared.checkout.data.CheckoutApi
import com.smartcart.shared.checkout.domain.CheckoutQuote
import com.smartcart.shared.cart.repository.Resource

class CheckoutRepository(private val api: CheckoutApi) {
    suspend fun previewCheckout(addressId: String): Resource<CheckoutQuote> {
        return try {
            val dto = api.previewCheckout(addressId)
            Resource.Success(
                CheckoutQuote(
                    quoteId = dto.quoteId,
                    generatedAt = dto.generatedAt,
                    cartId = dto.cartId,
                    subtotal = dto.subtotal,
                    minimumOrderSatisfied = dto.minimumOrderSatisfied,
                    deliveryEligible = dto.deliveryEligible,
                    validationErrors = dto.validationErrors?.map { it.code to it.message } ?: emptyList()
                )
            )
        } catch (e: Exception) {
            Resource.Error(e)
        }
    }
}
