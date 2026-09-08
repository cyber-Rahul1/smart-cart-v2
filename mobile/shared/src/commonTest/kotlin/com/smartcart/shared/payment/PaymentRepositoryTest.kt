package com.smartcart.shared.payment

import com.smartcart.shared.payment.data.PaymentApi
import com.smartcart.shared.payment.repository.PaymentRepository
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

class PaymentRepositoryTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun createRepository(mockEngine: MockEngine): PaymentRepository {
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(json)
            }
        }
        val api = PaymentApi(client)
        return PaymentRepository(api)
    }

    @Test
    fun testCODFlowReturnsAuthoritativeState() = runTest {
        val mockEngine = MockEngine { request ->
            respond(
                content = """{
                    "paymentId": "pay-1",
                    "providerOrderId": null,
                    "status": "PENDING",
                    "paymentMethod": "COD"
                }""",
                status = HttpStatusCode.Created,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }
        val repo = createRepository(mockEngine)
        
        val state = repo.initiatePayment("order-1", "COD", "idem-1")
        
        assertTrue(state is Resource.Success)
        val payment = state.data
        assertEquals("PENDING", payment.status)
        assertEquals("COD", payment.paymentMethod)
    }
}
