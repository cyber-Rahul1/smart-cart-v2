package com.smartcart.android.ui.tracking

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import com.smartcart.shared.tracking.domain.TrackingLocation
import com.smartcart.shared.tracking.repository.TrackingState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class TrackingScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun testTrackingLoadingState() {
        composeTestRule.setContent {
            TrackingScreen(
                deliveryId = "del-123",
                trackingState = TrackingState.Connecting,
                currentLocation = null,
                onStartTracking = {},
                onStopTracking = {},
                onBack = {}
            )
        }
        composeTestRule.onNodeWithText("Connecting to live tracking...").assertIsDisplayed()
    }

    @Test
    fun testLocationRendering() {
        val location = TrackingLocation(lat = 37.7749, lng = -122.4194, riderId = "rider1", riderTimestamp = 123456L, deliveryId = "del-123")
        composeTestRule.setContent {
            TrackingScreen(
                deliveryId = "del-123",
                trackingState = TrackingState.Active,
                currentLocation = location,
                onStartTracking = {},
                onStopTracking = {},
                onBack = {}
            )
        }
        composeTestRule.onNodeWithText("Live").assertIsDisplayed()
        composeTestRule.onNodeWithText("Lat: 37.7749, Lng: -122.4194").assertIsDisplayed()
    }

    @Test
    fun testDisconnectedStaleState() {
        composeTestRule.setContent {
            TrackingScreen(
                deliveryId = "del-123",
                trackingState = TrackingState.Reconnecting,
                currentLocation = null,
                onStartTracking = {},
                onStopTracking = {},
                onBack = {}
            )
        }
        composeTestRule.onNodeWithText("Connection lost. Reconnecting...").assertIsDisplayed()
        composeTestRule.onNodeWithText("Waiting for rider location...").assertIsDisplayed()
    }

    @Test
    fun testTerminalTrackingState() {
        composeTestRule.setContent {
            TrackingScreen(
                deliveryId = "del-123",
                trackingState = TrackingState.Idle,
                currentLocation = null,
                onStartTracking = {},
                onStopTracking = {},
                onBack = {}
            )
        }
        composeTestRule.onNodeWithText("Order delivered or cancelled. Tracking ended.").assertIsDisplayed()
    }

    @Test
    fun testCleanupWhenLeaving() {
        var startCalledId: String? = null
        var stopCalled = false
        val showScreen = androidx.compose.runtime.mutableStateOf(true)

        composeTestRule.setContent {
            if (showScreen.value) {
                TrackingScreen(
                    deliveryId = "del-123",
                    trackingState = TrackingState.Active,
                    currentLocation = null,
                    onStartTracking = { startCalledId = it },
                    onStopTracking = { stopCalled = true },
                    onBack = {}
                )
            }
        }
        
        assert(startCalledId == "del-123")
        assert(!stopCalled)

        // Simulate leaving the screen
        showScreen.value = false
        composeTestRule.waitForIdle() // Recompose
        
        assert(stopCalled)
    }
}
