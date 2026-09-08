package com.smartcart.android.ui.tracking

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.smartcart.shared.tracking.domain.TrackingLocation
import com.smartcart.shared.tracking.repository.TrackingState

@Composable
fun TrackingScreen(
    deliveryId: String,
    trackingState: TrackingState,
    currentLocation: TrackingLocation?,
    onStartTracking: (String) -> Unit,
    onStopTracking: () -> Unit,
    onBack: () -> Unit
) {
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current

    DisposableEffect(deliveryId, lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_START) {
                onStartTracking(deliveryId)
            } else if (event == androidx.lifecycle.Lifecycle.Event.ON_STOP) {
                onStopTracking()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            onStopTracking()
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(title = "Live Tracking")
        
        when (trackingState) {
            is TrackingState.Idle -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Order delivered or cancelled. Tracking ended.")
                }
            }
            is TrackingState.Connecting -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Connecting to live tracking...")
                }
            }
            is TrackingState.Reconnecting -> {
                Box(modifier = Modifier.fillMaxWidth().background(Color.Yellow).padding(8.dp), contentAlignment = Alignment.Center) {
                    Text("Connection lost. Reconnecting...", color = Color.Black)
                }
                MapCanvas(currentLocation)
            }
            is TrackingState.Active -> {
                Box(modifier = Modifier.fillMaxWidth().background(Color.Green).padding(8.dp), contentAlignment = Alignment.Center) {
                    Text("Live", color = Color.Black)
                }
                MapCanvas(currentLocation)
            }
            is TrackingState.Error -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Error: ${trackingState.message}", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
fun TopAppBar(title: String) {
    Surface(color = MaterialTheme.colorScheme.primary, modifier = Modifier.fillMaxWidth()) {
        Text(title, color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
fun MapCanvas(location: TrackingLocation?) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.LightGray),
        contentAlignment = Alignment.Center
    ) {
        if (location != null) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .background(Color.Blue, shape = CircleShape)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text("Lat: ${location.lat}, Lng: ${location.lng}")
            }
        } else {
            Text("Waiting for rider location...")
        }
    }
}
