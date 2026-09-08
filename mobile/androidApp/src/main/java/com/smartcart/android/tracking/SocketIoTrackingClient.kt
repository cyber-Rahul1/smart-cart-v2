package com.smartcart.android.tracking

import android.util.Log
import com.smartcart.shared.tracking.client.ConnectionState
import com.smartcart.shared.tracking.client.TrackingClient
import com.smartcart.shared.tracking.domain.TrackingLocation
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import org.json.JSONObject

class SocketIoTrackingClient(private val backendUrl: String) : TrackingClient {

    private var socket: Socket? = null

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _locationUpdates = MutableSharedFlow<TrackingLocation>(extraBufferCapacity = 10)
    override val locationUpdates: Flow<TrackingLocation> = _locationUpdates.asSharedFlow()

    private val _trackingTerminated = MutableSharedFlow<String>(extraBufferCapacity = 1)
    override val trackingTerminated: Flow<String> = _trackingTerminated.asSharedFlow()

    private val _errors = MutableSharedFlow<String>(extraBufferCapacity = 1)
    override val errors: Flow<String> = _errors.asSharedFlow()

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun connect(token: String) {
        if (socket?.connected() == true) return

        _connectionState.value = ConnectionState.CONNECTING

        try {
            val options = IO.Options.builder()
                .setPath("/socket.io/")
                .setTransports(arrayOf(io.socket.engineio.client.transports.WebSocket.NAME))
                .setAuth(mapOf("token" to token))
                .build()

            socket = IO.socket("$backendUrl/ws/v1/tracking", options)

            socket?.on(Socket.EVENT_CONNECT) {
                _connectionState.value = ConnectionState.CONNECTED
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                _connectionState.value = ConnectionState.DISCONNECTED
            }

            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                _connectionState.value = ConnectionState.DISCONNECTED
                val error = args.firstOrNull()?.toString() ?: "Unknown connection error"
                _errors.tryEmit(error)
            }

            socket?.on("location_update") { args ->
                try {
                    val jsonStr = args[0].toString()
                    val location = json.decodeFromString(TrackingLocation.serializer(), jsonStr)
                    _locationUpdates.tryEmit(location)
                } catch (e: Exception) {
                    Log.e("TrackingClient", "Failed to parse location_update: \${e.message}")
                }
            }

            socket?.on("tracking_terminated") { args ->
                try {
                    val data = args[0] as JSONObject
                    val deliveryId = data.getString("deliveryId")
                    _trackingTerminated.tryEmit(deliveryId)
                } catch (e: Exception) {
                    Log.e("TrackingClient", "Failed to parse tracking_terminated: \${e.message}")
                }
            }
            
            socket?.on("error") { args ->
                try {
                    val data = args[0] as JSONObject
                    val message = data.getString("message")
                    _errors.tryEmit(message)
                } catch (e: Exception) {
                    Log.e("TrackingClient", "Failed to parse error: \${e.message}")
                }
            }

            socket?.connect()
        } catch (e: Exception) {
            _connectionState.value = ConnectionState.DISCONNECTED
            _errors.tryEmit(e.message ?: "Failed to initialize socket")
        }
    }

    override suspend fun subscribeDelivery(deliveryId: String) {
        val payload = JSONObject().apply { put("deliveryId", deliveryId) }
        socket?.emit("subscribe_delivery", payload)
    }

    override suspend fun unsubscribeDelivery(deliveryId: String) {
        val payload = JSONObject().apply { put("deliveryId", deliveryId) }
        socket?.emit("unsubscribe_delivery", payload)
    }

    override fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }
}
