package com.smartcart.shared.notifications

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DeepLinkParserTest {

    @Test
    fun parse_validOrderLink_returnsOrderDetailDestination() {
        val link = "smartcart://orders/123e4567-e89b-12d3-a456-426614174000"
        val result = DeepLinkParser.parse(link)
        
        assertTrue(result is DeepLinkParser.Destination.OrderDetail)
        assertEquals("123e4567-e89b-12d3-a456-426614174000", result.orderId)
    }

    @Test
    fun parse_validTrackingLink_returnsTrackingDestination() {
        val link = "smartcart://tracking/DELIV-123"
        val result = DeepLinkParser.parse(link)
        
        assertTrue(result is DeepLinkParser.Destination.Tracking)
        assertEquals("DELIV-123", result.deliveryId)
    }

    @Test
    fun parse_validNotificationsLink_returnsNotificationsDestination() {
        val link = "smartcart://notifications"
        val result = DeepLinkParser.parse(link)
        
        assertTrue(result is DeepLinkParser.Destination.Notifications)
    }

    @Test
    fun parse_invalidScheme_returnsHome() {
        val link = "http://orders/123"
        val result = DeepLinkParser.parse(link)
        assertEquals(DeepLinkParser.Destination.Home, result)
    }

    @Test
    fun parse_invalidHost_returnsHome() {
        val link = "smartcart://unknown/123"
        val result = DeepLinkParser.parse(link)
        assertEquals(DeepLinkParser.Destination.Home, result)
    }

    @Test
    fun parse_missingId_returnsHome() {
        val link = "smartcart://orders"
        val result = DeepLinkParser.parse(link)
        assertEquals(DeepLinkParser.Destination.Home, result)
    }

    @Test
    fun parse_malformedId_returnsHome() {
        // ID contains invalid characters
        val link = "smartcart://orders/123@invalid!"
        val result = DeepLinkParser.parse(link)
        assertEquals(DeepLinkParser.Destination.Home, result)
    }

    @Test
    fun parse_nullLink_returnsHome() {
        val result = DeepLinkParser.parse(null)
        assertEquals(DeepLinkParser.Destination.Home, result)
    }
}
