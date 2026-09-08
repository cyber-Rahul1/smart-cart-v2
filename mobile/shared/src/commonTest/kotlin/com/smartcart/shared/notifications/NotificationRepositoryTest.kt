package com.smartcart.shared.notifications

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

class NotificationRepositoryTest {

    private fun createRepository(engine: MockEngine): NotificationRepository {
        val client = HttpClient(engine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        return NotificationRepository(client)
    }

    @Test
    fun getHistory_success_updatesStateFlow() = runTest {
        val jsonResponse = """
            {
                "success": true,
                "data": [
                    {
                        "id": "notif-1",
                        "userId": "user-1",
                        "title": "Order Placed",
                        "body": "Your order was placed.",
                        "type": "order.created",
                        "entityId": "order-1",
                        "eventId": "event-1",
                        "status": "UNREAD",
                        "createdAt": "2024-01-01T10:00:00Z"
                    }
                ]
            }
        """.trimIndent()

        val mockEngine = MockEngine { request ->
            respond(
                content = jsonResponse,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }

        val repository = createRepository(mockEngine)
        val result = repository.getHistory()

        assertTrue(result.isSuccess)
        val notifications = repository.notifications.value
        assertEquals(1, notifications.size)
        assertEquals("notif-1", notifications[0].id)
        assertEquals(false, notifications[0].isRead) // UNREAD mapping
    }

    @Test
    fun markAsRead_success_updatesStateLocally() = runTest {
        // Initial state load
        val jsonResponse1 = """
            {
                "success": true,
                "data": [
                    {
                        "id": "notif-1",
                        "userId": "user-1",
                        "title": "Order Placed",
                        "body": "Your order was placed.",
                        "type": "order.created",
                        "entityId": "order-1",
                        "eventId": "event-1",
                        "status": "UNREAD",
                        "createdAt": "2024-01-01T10:00:00Z"
                    }
                ]
            }
        """.trimIndent()
        
        val jsonResponse2 = """
            {
                "success": true
            }
        """.trimIndent()

        var callCount = 0
        val mockEngine = MockEngine { request ->
            if (callCount == 0) {
                callCount++
                respond(
                    content = jsonResponse1,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            } else {
                respond(
                    content = jsonResponse2,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            }
        }

        val repository = createRepository(mockEngine)
        repository.getHistory()

        assertEquals(false, repository.notifications.value[0].isRead)

        val result = repository.markAsRead("notif-1")
        assertTrue(result.isSuccess)
        
        // Assert local state updated to true
        assertEquals(true, repository.notifications.value[0].isRead)
    }

    @Test
    fun markAsRead_failure_doesNotUpdateStateLocally() = runTest {
        val jsonResponse1 = """
            {
                "success": true,
                "data": [
                    {
                        "id": "notif-1",
                        "userId": "user-1",
                        "title": "Order Placed",
                        "body": "Your order was placed.",
                        "type": "order.created",
                        "entityId": "order-1",
                        "eventId": "event-1",
                        "status": "UNREAD",
                        "createdAt": "2024-01-01T10:00:00Z"
                    }
                ]
            }
        """.trimIndent()
        
        var callCount = 0
        val mockEngine = MockEngine { request ->
            if (callCount == 0) {
                callCount++
                respond(
                    content = jsonResponse1,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            } else {
                respond(
                    content = "Internal Server Error",
                    status = HttpStatusCode.InternalServerError
                )
            }
        }

        val repository = createRepository(mockEngine)
        repository.getHistory()

        val result = repository.markAsRead("notif-1")
        assertTrue(result.isFailure)
        
        // Assert local state remains false
        assertEquals(false, repository.notifications.value[0].isRead)
    }
}
