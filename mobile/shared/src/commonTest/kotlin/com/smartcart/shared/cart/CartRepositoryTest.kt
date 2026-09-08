package com.smartcart.shared.cart

import com.smartcart.shared.cart.data.CartApi
import com.smartcart.shared.cart.domain.CartShopConflictError
import com.smartcart.shared.cart.repository.CartRepository
import com.smartcart.shared.cart.repository.Resource
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CartRepositoryTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun createRepository(mockEngine: MockEngine): CartRepository {
        val client = HttpClient(mockEngine) {
            expectSuccess = true
            install(ContentNegotiation) {
                json(json)
            }
        }
        val api = CartApi(client)
        return CartRepository(api)
    }

    @Test
    fun testCartShopConflictHandling() = runTest {
        val mockEngine = MockEngine { request ->
            respond(
                content = """{"statusCode":409,"message":"Cart contains items from a different shop. Clear your cart first.","error":"Conflict"}""",
                status = HttpStatusCode.Conflict,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }
        val repo = createRepository(mockEngine)
        
        repo.addItem("prod-1", 1)
        val state = repo.cartState.value
        
        assertTrue(state is Resource.Error)
        assertTrue(state.exception is CartShopConflictError)
    }

    @Test
    fun testMoneyStringExactPreservation() = runTest {
        val mockEngine = MockEngine { request ->
            respond(
                content = """{
                    "success": true,
                    "data": {
                        "id": "cart-123",
                        "shop": null,
                        "items": [],
                        "subtotal": 10.50,
                        "minimumOrder": 999999.99,
                        "remainingAmount": 0.01,
                        "itemCount": 0,
                        "totalQuantity": 0
                    }
                }""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }
        val repo = createRepository(mockEngine)
        
        repo.fetchCart()
        val state = repo.cartState.value
        
        assertTrue(state is Resource.Success)
        val cart = state.data
        assertEquals("10.50", cart.subtotal)
        assertEquals("999999.99", cart.minimumOrder)
        assertEquals("0.01", cart.remainingAmount)
    }
}
