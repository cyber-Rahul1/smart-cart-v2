package com.smartcart.shared.order.repository

import com.smartcart.shared.cart.repository.Resource
import com.smartcart.shared.order.data.OrderApi
import com.smartcart.shared.order.data.OrderResponseDto
import com.smartcart.shared.order.data.OrdersSuccessResponseDto
import com.smartcart.shared.order.domain.Order
import com.smartcart.shared.order.domain.OrderStatus
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OrderRepositoryTest {

    private fun mockApi(response: OrdersSuccessResponseDto): OrderApi {
        val mockEngine = MockEngine { request ->
            respond(
                content = Json.encodeToString(response),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        return OrderApi(client)
    }

    @Test
    fun testOrderMappingAndDeliveryIdNull() = runTest {
        val responseDto = OrdersSuccessResponseDto(
            success = true,
            data = listOf(
                OrderResponseDto(
                    id = "order-1",
                    shopId = "shop-1",
                    status = "PLACED",
                    subtotal = "10.00",
                    deliveryFee = "5.00",
                    totalAmount = "15.00",
                    deliveryAddressLabel = "Home",
                    deliveryAddressLine = "123 Main St",
                    cancellationReason = null,
                    cancelledAt = null,
                    createdAt = "2024-01-01T00:00:00Z",
                    updatedAt = "2024-01-01T00:00:00Z",
                    deliveryId = null
                )
            )
        )
        val api = mockApi(responseDto)
        val repo = OrderRepository(api)
        
        val result = repo.getOrders()
        assertIs<Resource.Success<*>>(result)
        
        val successResult = result as Resource.Success<List<Order>>
        val orders = successResult.data
        assertEquals(1, orders.size)
        val order = orders.first()
        
        assertEquals("order-1", order.id)
        assertEquals(OrderStatus.PLACED, order.status)
        assertNull(order.deliveryId)
    }

    @Test
    fun testOrderMappingAndDeliveryIdPresent() = runTest {
        val responseDto = OrdersSuccessResponseDto(
            success = true,
            data = listOf(
                OrderResponseDto(
                    id = "order-2",
                    shopId = "shop-2",
                    status = "OUT_FOR_DELIVERY",
                    subtotal = "20.00",
                    deliveryFee = "0.00",
                    totalAmount = "20.00",
                    deliveryAddressLabel = "Work",
                    deliveryAddressLine = "456 Office St",
                    cancellationReason = null,
                    cancelledAt = null,
                    createdAt = "2024-01-02T00:00:00Z",
                    updatedAt = "2024-01-02T00:00:00Z",
                    deliveryId = "del-123"
                )
            )
        )
        val api = mockApi(responseDto)
        val repo = OrderRepository(api)
        
        val result = repo.getOrders()
        assertIs<Resource.Success<*>>(result)
        
        val successResult = result as Resource.Success<List<Order>>
        val order = successResult.data.first()
        assertEquals("del-123", order.deliveryId)
    }
    
    @Test
    fun testOrderTerminalStates() {
        // active states
        assertTrue(!OrderStatus.PLACED.isTerminal())
        assertTrue(!OrderStatus.SHOP_ACCEPTED.isTerminal())
        assertTrue(!OrderStatus.PREPARING.isTerminal())
        assertTrue(!OrderStatus.READY_FOR_PICKUP.isTerminal())
        assertTrue(!OrderStatus.OUT_FOR_DELIVERY.isTerminal())
        
        // terminal states
        assertTrue(OrderStatus.DELIVERED.isTerminal())
        assertTrue(OrderStatus.CANCELLED.isTerminal())
        assertTrue(OrderStatus.PAYMENT_FAILED.isTerminal())
    }
}
