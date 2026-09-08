package com.smartcart.shared.tracking.repository

import com.smartcart.shared.cart.repository.Resource
import com.smartcart.shared.order.data.OrderApi
import com.smartcart.shared.order.domain.Order
import com.smartcart.shared.order.domain.OrderStatus
import com.smartcart.shared.order.repository.OrderRepository
import com.smartcart.shared.tracking.client.ConnectionState
import com.smartcart.shared.tracking.client.TrackingClient
import com.smartcart.shared.tracking.domain.TrackingLocation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import io.ktor.client.engine.mock.respond

class FakeTrackingClient : TrackingClient {
    val connectionStateFlow = MutableStateFlow(ConnectionState.DISCONNECTED)
    override val connectionState: StateFlow<ConnectionState> = connectionStateFlow
    
    val locationUpdatesFlow = MutableSharedFlow<TrackingLocation>(extraBufferCapacity = 10)
    override val locationUpdates: Flow<TrackingLocation> = locationUpdatesFlow
    
    val trackingTerminatedFlow = MutableSharedFlow<String>(extraBufferCapacity = 1)
    override val trackingTerminated: Flow<String> = trackingTerminatedFlow
    
    override val errors: Flow<String> = MutableSharedFlow()
    
    var connectedToken: String? = null
    var subscribedDeliveryId: String? = null
    var isDisconnected = true
    
    override suspend fun connect(token: String) {
        connectedToken = token
        isDisconnected = false
        connectionStateFlow.value = ConnectionState.CONNECTED
    }
    
    override suspend fun subscribeDelivery(deliveryId: String) {
        subscribedDeliveryId = deliveryId
    }
    
    override suspend fun unsubscribeDelivery(deliveryId: String) {
        if (subscribedDeliveryId == deliveryId) {
            subscribedDeliveryId = null
        }
    }
    
    override fun disconnect() {
        isDisconnected = true
        connectedToken = null
        connectionStateFlow.value = ConnectionState.DISCONNECTED
    }
}

class FakeOrderRepository : OrderRepository(
    OrderApi(io.ktor.client.HttpClient(io.ktor.client.engine.mock.MockEngine { respond("") }))
) {
    var mockedOrders: List<Order> = emptyList()
    
    override suspend fun getOrders(): Resource<List<Order>> {
        return Resource.Success(mockedOrders)
    }
}

class TrackingRepositoryTest {

    @Test
    fun testStartTrackingSubscribesAndDisconnects() = runTest(UnconfinedTestDispatcher()) {
        val client = FakeTrackingClient()
        val orderRepo = FakeOrderRepository()
        
        // Mock order response for HTTP resync
        val mockOrder = Order("order-1", "shop-1", OrderStatus.OUT_FOR_DELIVERY, "0", "0", "0", "L", "L", "D", "del-123")
        orderRepo.mockedOrders = listOf(mockOrder)
        
        val repo = TrackingRepository(client, orderRepo, backgroundScope, { "fake-token" })
        
        assertEquals(TrackingState.Idle, repo.trackingState.value)
        
        repo.startTracking("del-123")
        
        assertEquals("fake-token", client.connectedToken)
        assertEquals("del-123", client.subscribedDeliveryId)
        assertEquals(TrackingState.Active, repo.trackingState.value)
        
        repo.stopTracking()
        
        assertEquals(TrackingState.Idle, repo.trackingState.value)
        assertTrue(client.isDisconnected)
    }
    
    @Test
    fun testDuplicateSubscriptionPrevention() = runTest(UnconfinedTestDispatcher()) {
        val client = FakeTrackingClient()
        val orderRepo = FakeOrderRepository()
        val mockOrder = Order("order-1", "shop-1", OrderStatus.OUT_FOR_DELIVERY, "0", "0", "0", "L", "L", "D", "del-123")
        orderRepo.mockedOrders = listOf(mockOrder)
        val repo = TrackingRepository(client, orderRepo, backgroundScope, { "fake-token" })
        
        repo.startTracking("del-123")
        client.subscribedDeliveryId = null // clear it to see if it sets again
        
        repo.startTracking("del-123") // Should be ignored
        assertNull(client.subscribedDeliveryId)
    }

    @Test
    fun testReconnectBehaviorAndHttpResync() = runTest(UnconfinedTestDispatcher()) {
        val client = FakeTrackingClient()
        val orderRepo = FakeOrderRepository()
        val mockOrder = Order("order-1", "shop-1", OrderStatus.OUT_FOR_DELIVERY, "0", "0", "0", "L", "L", "D", "del-123")
        orderRepo.mockedOrders = listOf(mockOrder)
        val repo = TrackingRepository(client, orderRepo, backgroundScope, { "fake-token" })
        
        repo.startTracking("del-123")
        assertEquals(TrackingState.Active, repo.trackingState.value)
        
        // Simulate disconnect
        client.connectionStateFlow.value = ConnectionState.DISCONNECTED
        assertEquals(TrackingState.Reconnecting, repo.trackingState.value)
        
        // Advance time to trigger backoff
        advanceTimeBy(1100)
        
        // Should have reconnected
        assertEquals(TrackingState.Active, repo.trackingState.value)
        assertEquals("fake-token", client.connectedToken)
    }
    
    @Test
    fun testTerminalOrderStopsReconnect() = runTest(UnconfinedTestDispatcher()) {
        val client = FakeTrackingClient()
        val orderRepo = FakeOrderRepository()
        val mockOrderTerminal = Order("order-1", "shop-1", OrderStatus.DELIVERED, "0", "0", "0", "L", "L", "D", "del-123")
        orderRepo.mockedOrders = listOf(mockOrderTerminal)
        val repo = TrackingRepository(client, orderRepo, backgroundScope, { "fake-token" })
        
        repo.startTracking("del-123")
        
        // The first HTTP resync immediately sees terminal and stops tracking
        assertEquals(TrackingState.Idle, repo.trackingState.value)
        assertTrue(client.isDisconnected)
    }
    
    @Test
    fun testTrackingTerminatedEvent() = runTest(UnconfinedTestDispatcher()) {
        val client = FakeTrackingClient()
        val orderRepo = FakeOrderRepository()
        
        var mockOrder = Order("order-1", "shop-1", OrderStatus.OUT_FOR_DELIVERY, "0", "0", "0", "L", "L", "D", "del-123")
        orderRepo.mockedOrders = listOf(mockOrder)
        val repo = TrackingRepository(client, orderRepo, backgroundScope, { "fake-token" })
        
        repo.startTracking("del-123")
        assertEquals(TrackingState.Active, repo.trackingState.value)
        
        // Change order to terminal for the resync
        mockOrder = Order("order-1", "shop-1", OrderStatus.DELIVERED, "0", "0", "0", "L", "L", "D", "del-123")
        orderRepo.mockedOrders = listOf(mockOrder)
        
        // Simulate tracking_terminated
        client.trackingTerminatedFlow.emit("del-123")
        
        // Should fetch order, see it's terminal, and disconnect
        assertEquals(TrackingState.Idle, repo.trackingState.value)
    }
}
