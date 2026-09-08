package com.smartcart.shared.order.domain

enum class OrderStatus {
    CREATED,
    PAYMENT_PENDING,
    PLACED,
    SHOP_ACCEPTED,
    PREPARING,
    READY_FOR_PICKUP,
    RIDER_ASSIGNED,
    RIDER_ACCEPTED,
    PICKED_UP,
    OUT_FOR_DELIVERY,
    ARRIVING,
    DELIVERED,
    PAYMENT_FAILED,
    REJECTED,
    CANCELLED,
    DELIVERY_FAILED,
    REFUNDED,
    DISPUTED,
    UNKNOWN;
    
    fun isActive(): Boolean {
        return this in listOf(
            PLACED, SHOP_ACCEPTED, PREPARING, READY_FOR_PICKUP, 
            RIDER_ASSIGNED, RIDER_ACCEPTED, PICKED_UP, OUT_FOR_DELIVERY, ARRIVING
        )
    }

    fun isTerminal(): Boolean {
        return this in listOf(
            DELIVERED, PAYMENT_FAILED, REJECTED, CANCELLED, DELIVERY_FAILED, REFUNDED, DISPUTED
        )
    }

    companion object {
        fun fromString(status: String): OrderStatus {
            return entries.find { it.name.equals(status, ignoreCase = true) } ?: UNKNOWN
        }
    }
}
