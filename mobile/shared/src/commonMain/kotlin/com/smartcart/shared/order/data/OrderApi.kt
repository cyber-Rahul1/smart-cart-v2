package com.smartcart.shared.order.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType

class OrderApi(private val client: HttpClient) {
    suspend fun createOrder(dto: CreateOrderDto): OrderSuccessResponseDto {
        return client.post("/orders") {
            contentType(ContentType.Application.Json)
            setBody(dto)
        }.body()
    }

    suspend fun getOrder(id: String): OrderSuccessResponseDto {
        return client.get("/orders/${id}").body()
    }

    suspend fun getOrders(): OrdersSuccessResponseDto {
        return client.get("/orders").body()
    }
}
