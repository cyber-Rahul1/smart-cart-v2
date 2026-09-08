package com.smartcart.shared.tracking.repository

import com.smartcart.shared.order.repository.OrderRepository
import com.smartcart.shared.tracking.client.ConnectionState
import com.smartcart.shared.tracking.client.TrackingClient
import com.smartcart.shared.tracking.domain.TrackingLocation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.math.min

class TrackingRepository(
    private val trackingClient: TrackingClient,
    private val orderRepository: OrderRepository,
    private val scope: CoroutineScope,
    private val tokenProvider: suspend () -> String?
) {

    private var activeDeliveryId: String? = null
    private var trackingJob: Job? = null
    private val mutex = Mutex()

    private val _trackingState = MutableStateFlow<TrackingState>(TrackingState.Idle)
    val trackingState: StateFlow<TrackingState> = _trackingState.asStateFlow()
    
    val locationUpdates: Flow<TrackingLocation> = trackingClient.locationUpdates

    suspend fun startTracking(deliveryId: String) {
        mutex.withLock {
            if (activeDeliveryId == deliveryId) return
            
            // Clean up any existing tracking session
            stopTrackingInternal()

            activeDeliveryId = deliveryId
            _trackingState.value = TrackingState.Connecting
            
            trackingJob = scope.launch {
                observeClientEvents(deliveryId)
                connectAndSubscribe(deliveryId)
            }
        }
    }

    suspend fun stopTracking() {
        mutex.withLock {
            stopTrackingInternal()
        }
    }

    private fun stopTrackingInternal() {
        activeDeliveryId = null
        trackingJob?.cancel()
        trackingJob = null
        trackingClient.disconnect()
        _trackingState.value = TrackingState.Idle
    }

    private suspend fun connectAndSubscribe(deliveryId: String) {
        val token = tokenProvider()
        if (token == null) {
            _trackingState.value = TrackingState.Error("Unauthenticated")
            stopTrackingInternal()
            return
        }

        try {
            trackingClient.connect(token)
            trackingClient.subscribeDelivery(deliveryId)
        } catch (e: Exception) {
            _trackingState.value = TrackingState.Error(e.message ?: "Failed to connect")
        }
    }

    private fun observeClientEvents(deliveryId: String) {
        trackingClient.connectionState.onEach { state ->
            when (state) {
                ConnectionState.CONNECTED -> {
                    _trackingState.value = TrackingState.Active
                    // Resync via HTTP to ensure order is still active
                    verifyOrderState(deliveryId)
                }
                ConnectionState.DISCONNECTED -> {
                    if (activeDeliveryId == deliveryId) {
                        _trackingState.value = TrackingState.Reconnecting
                        handleReconnect(deliveryId)
                    }
                }
                ConnectionState.CONNECTING -> {
                    _trackingState.value = TrackingState.Connecting
                }
            }
        }.launchIn(scope)

        trackingClient.trackingTerminated.onEach { terminatedId ->
            if (terminatedId == activeDeliveryId) {
                verifyOrderState(deliveryId) // Should fetch terminal state and disconnect
            }
        }.launchIn(scope)
    }

    private suspend fun handleReconnect(deliveryId: String) {
        var attempt = 0
        val maxDelay = 30000L // 30 seconds max backoff

        while (activeDeliveryId == deliveryId && trackingClient.connectionState.value == ConnectionState.DISCONNECTED) {
            val backoff = min(1000L * (1 shl attempt), maxDelay)
            delay(backoff)
            
            if (activeDeliveryId != deliveryId) break
            
            attempt++
            connectAndSubscribe(deliveryId)
        }
    }

    private suspend fun verifyOrderState(deliveryId: String) {
        val resource = orderRepository.getOrders()
        val order = if (resource is com.smartcart.shared.cart.repository.Resource.Success) {
            resource.data.find { it.deliveryId == deliveryId }
        } else null
        
        if (order == null || order.status.isTerminal()) {
            stopTrackingInternal()
        }
    }
}

sealed class TrackingState {
    object Idle : TrackingState()
    object Connecting : TrackingState()
    object Active : TrackingState()
    object Reconnecting : TrackingState()
    data class Error(val message: String) : TrackingState()
}
