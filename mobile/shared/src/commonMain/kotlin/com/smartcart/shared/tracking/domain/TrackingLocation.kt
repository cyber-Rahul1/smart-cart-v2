package com.smartcart.shared.tracking.domain

import kotlinx.serialization.Serializable

@Serializable
data class TrackingLocation(
    val riderId: String,
    val lat: Double,
    val lng: Double,
    val riderTimestamp: Long,
    val deliveryId: String
)
