package com.smartcart.shared.notifications

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.patch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class NotificationRepository(
    private val httpClient: HttpClient
) {
    private val _notifications = MutableStateFlow<List<Notification>>(emptyList())
    val notifications: StateFlow<List<Notification>> = _notifications.asStateFlow()

    suspend fun getHistory(): Result<List<Notification>> {
        return try {
            val response: NotificationResponse = httpClient.get("/customers/notifications").body()
            if (response.success) {
                val domainList = response.data.map { it.toDomain() }
                _notifications.value = domainList
                Result.success(domainList)
            } else {
                Result.failure(Exception("Failed to fetch notifications"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun markAsRead(id: String): Result<Unit> {
        return try {
            val response: Map<String, Boolean> = httpClient.patch("/customers/notifications/$id/read").body()
            if (response["success"] == true) {
                // Update local state ONLY after successful backend response
                val currentList = _notifications.value
                val updatedList = currentList.map { 
                    if (it.id == id) it.copy(isRead = true) else it 
                }
                _notifications.value = updatedList
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to mark as read"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
