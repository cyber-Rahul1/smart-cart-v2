package com.smartcart.shared.notifications

import kotlinx.serialization.Serializable

@Serializable
data class NotificationDto(
    val id: String,
    val userId: String,
    val title: String,
    val body: String,
    val type: String?,
    val entityId: String?,
    val eventId: String?,
    val status: String,
    val createdAt: String
)

@Serializable
data class NotificationResponse(
    val success: Boolean,
    val data: List<NotificationDto>
)

data class Notification(
    val id: String,
    val title: String,
    val body: String,
    val type: String?,
    val entityId: String?,
    val isRead: Boolean,
    val createdAt: String
)

fun NotificationDto.toDomain() = Notification(
    id = id,
    title = title,
    body = body,
    type = type,
    entityId = entityId,
    isRead = status == "READ",
    createdAt = createdAt
)
