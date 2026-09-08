package com.smartcart.shared.tracking.client

import com.smartcart.shared.tracking.domain.TrackingLocation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

interface TrackingClient {
    val connectionState: StateFlow<ConnectionState>
    val locationUpdates: Flow<TrackingLocation>
    val trackingTerminated: Flow<String>
    val errors: Flow<String>

    suspend fun connect(token: String)
    suspend fun subscribeDelivery(deliveryId: String)
    suspend fun unsubscribeDelivery(deliveryId: String)
    fun disconnect()
}

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED
}
