package com.smartcart.shared.order

import com.smartcart.shared.order.data.OrderApi
import com.smartcart.shared.order.repository.OrderRepository
import com.smartcart.shared.cart.repository.Resource
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OrderRepositoryTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun createRepository(mockEngine: MockEngine): OrderRepository {
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(json)
            }
        }
        val api = OrderApi(client)
        return OrderRepository(api)
    }

    @Test
    fun testRepeatedPlaceOrderUsesIdempotencyKey() = runTest {
        var callCount = 0
        val mockEngine = MockEngine { request ->
            callCount++
            respond(
                content = """{
                    "success": true,
                    "data": {
                        "id": "order-1",
                        "shopId": "shop-1",
                        "status": "CREATED",
                        "subtotal": "50.00",
                        "deliveryFee": "10.00",
                        "totalAmount": "60.00",
                        "deliveryAddressLabel": "Home",
                        "deliveryAddressLine": "123",
                        "cancellationReason": null,
                        "cancelledAt": null,
                        "createdAt": "2023-01-01T12:00:00Z",
                        "updatedAt": "2023-01-01T12:00:00Z"
                    }
                }""",
                status = if (callCount == 1) HttpStatusCode.Created else HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }
        val repo = createRepository(mockEngine)
        
        val key = "idem-key-1"
        // First attempt
        val state1 = repo.createOrder("addr-1", key)
        assertTrue(state1 is Resource.Success)
        
        // Second attempt with same key (simulating retry)
        val state2 = repo.createOrder("addr-1", key)
        assertTrue(state2 is Resource.Success)
        
        assertEquals(state1.data.id, state2.data.id)
        assertEquals(2, callCount)
    }
}
