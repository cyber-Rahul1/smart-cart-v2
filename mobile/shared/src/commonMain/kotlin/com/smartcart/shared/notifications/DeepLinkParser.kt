package com.smartcart.shared.notifications

object DeepLinkParser {
    
    sealed class Destination {
        data class OrderDetail(val orderId: String) : Destination()
        data class Tracking(val deliveryId: String) : Destination()
        object Notifications : Destination()
        object Home : Destination()
    }
    
    fun parse(deepLink: String?): Destination {
        if (deepLink.isNullOrBlank()) return Destination.Home
        
        try {
            // e.g. smartcart://orders/123-abc
            if (!deepLink.startsWith("smartcart://")) return Destination.Home
            
            val pathPart = deepLink.removePrefix("smartcart://")
            val segments = pathPart.split("/")
            
            if (segments.isEmpty()) return Destination.Home
            
            val host = segments[0]
            
            return when (host) {
                "orders" -> {
                    if (segments.size > 1 && isValidUuidOrId(segments[1])) {
                        Destination.OrderDetail(segments[1])
                    } else {
                        Destination.Home
                    }
                }
                "tracking" -> {
                    if (segments.size > 1 && isValidUuidOrId(segments[1])) {
                        Destination.Tracking(segments[1])
                    } else {
                        Destination.Home
                    }
                }
                "notifications" -> Destination.Notifications
                else -> Destination.Home
            }
        } catch (e: Exception) {
            return Destination.Home
        }
    }
    
    // Very basic alphanumeric/UUID validation to prevent arbitrary injection
    private fun isValidUuidOrId(id: String): Boolean {
        return id.matches(Regex("^[a-zA-Z0-9-]+\$"))
    }
}
