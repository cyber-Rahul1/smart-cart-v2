package com.smartcart.shared.notifications

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object PendingDeepLinkManager {
    private val _pendingDestination = MutableStateFlow<DeepLinkParser.Destination?>(null)
    val pendingDestination: StateFlow<DeepLinkParser.Destination?> = _pendingDestination.asStateFlow()

    fun setPendingDestination(destination: DeepLinkParser.Destination) {
        // Only set if not Home
        if (destination != DeepLinkParser.Destination.Home) {
            _pendingDestination.value = destination
        }
    }

    fun consumePendingDestination(): DeepLinkParser.Destination? {
        val dest = _pendingDestination.value
        _pendingDestination.value = null
        return dest
    }
}
