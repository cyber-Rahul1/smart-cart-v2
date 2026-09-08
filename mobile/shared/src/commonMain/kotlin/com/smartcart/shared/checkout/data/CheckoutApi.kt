package com.smartcart.shared.checkout.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType

class CheckoutApi(private val client: HttpClient) {
    suspend fun previewCheckout(addressId: String): CheckoutQuoteDto {
        return client.post("/checkout/preview") {
            contentType(ContentType.Application.Json)
            setBody(CheckoutPreviewRequestDto(addressId))
        }.body()
    }
}
