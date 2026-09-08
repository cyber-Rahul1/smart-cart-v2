package com.smartcart.shared.cart.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType

class CartApi(private val client: HttpClient) {
    suspend fun getCart(): CartResponseDto {
        return client.get("/cart").body()
    }

    suspend fun addItem(productId: String, quantity: Int): CartResponseDto {
        return client.post("/cart/items") {
            contentType(ContentType.Application.Json)
            setBody(AddToCartDto(productId, quantity))
        }.body()
    }

    suspend fun updateItemQuantity(cartItemId: String, quantity: Int): CartResponseDto {
        return client.patch("/cart/items/${cartItemId}") {
            contentType(ContentType.Application.Json)
            setBody(UpdateCartItemDto(quantity))
        }.body()
    }

    suspend fun removeItem(cartItemId: String): CartResponseDto {
        return client.delete("/cart/items/${cartItemId}").body()
    }

    suspend fun clearCart(): CartResponseDto {
        return client.delete("/cart").body()
    }
}
