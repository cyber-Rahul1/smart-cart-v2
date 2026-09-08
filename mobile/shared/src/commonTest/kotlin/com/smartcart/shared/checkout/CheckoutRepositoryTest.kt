package com.smartcart.shared.checkout

import com.smartcart.shared.checkout.data.CheckoutApi
import com.smartcart.shared.checkout.repository.CheckoutRepository
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

class CheckoutRepositoryTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun createRepository(mockEngine: MockEngine): CheckoutRepository {
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(json)
            }
        }
        val api = CheckoutApi(client)
        return CheckoutRepository(api)
    }

    @Test
    fun testServerPriceChangesBetweenCartAndCheckout() = runTest {
        val mockEngine = MockEngine { request ->
            respond(
                content = """{
                    "quoteId": "quote-1",
                    "generatedAt": "2023-01-01T12:00:00Z",
                    "cartId": "cart-1",
                    "shop": { "id": "shop-1", "name": "Shop", "minimumOrder": "100.00", "deliveryRadius": 5.0 },
                    "address": { "id": "addr-1", "label": "Home", "distanceMeters": 1000.0 },
                    "items": [
                        { "productId": "prod-1", "name": "Changed Price Item", "quantity": 1, "unitPrice": "20.50", "lineTotal": "20.50", "isAvailable": true }
                    ],
                    "subtotal": "20.50",
                    "minimumOrderSatisfied": false,
                    "deliveryEligible": true
                }""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }
        val repo = createRepository(mockEngine)
        
        val state = repo.previewCheckout("addr-1")
        
        assertTrue(state is Resource.Success)
        val quote = state.data
        assertEquals("20.50", quote.subtotal) // Validates authoritative quote
        assertEquals(false, quote.minimumOrderSatisfied)
    }
}
