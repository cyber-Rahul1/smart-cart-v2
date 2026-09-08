package com.smartcart.android.ui.order

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertIsDisplayed
import com.smartcart.shared.order.domain.Order
import com.smartcart.shared.order.domain.OrderStatus
import com.smartcart.shared.order.domain.OrderItem
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class OrderDetailScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun testLoadingState() {
        composeTestRule.setContent {
            OrderDetailScreen(order = null, isLoading = true, onTrackOrderClick = {})
        }
        composeTestRule.onNodeWithText("Order not found.").assertDoesNotExist()
    }

    @Test
    fun testOrderItemsAndTotals() {
        val items = listOf(
            OrderItem("item1", "prod1", "Apple", "1.00", 2, "2.00")
        )
        val order = Order("1", "shop1", OrderStatus.PLACED, "2.00", "5.00", "7.00", "Home", "123 St", "now", null, items)
        
        composeTestRule.setContent {
            OrderDetailScreen(order = order, isLoading = false, onTrackOrderClick = {})
        }
        
        composeTestRule.onNodeWithText("Order #1").assertIsDisplayed()
        composeTestRule.onNodeWithText("Status: PLACED").assertIsDisplayed()
        composeTestRule.onNodeWithText("Home - 123 St").assertIsDisplayed()
        composeTestRule.onNodeWithText("2x Apple").assertIsDisplayed()
        composeTestRule.onNodeWithText("\$2.00").assertIsDisplayed() // lineTotal
        composeTestRule.onNodeWithText("Subtotal: \$2.00").assertIsDisplayed()
        composeTestRule.onNodeWithText("Delivery Fee: \$5.00").assertIsDisplayed()
        composeTestRule.onNodeWithText("Total: \$7.00").assertIsDisplayed()
        
        // Track Order should not be displayed because deliveryId is null
        composeTestRule.onNodeWithText("Track Order").assertDoesNotExist()
    }

    @Test
    fun testTrackOrderEligibility() {
        var trackClickedId: String? = null
        val order = Order("1", "shop1", OrderStatus.OUT_FOR_DELIVERY, "2.00", "5.00", "7.00", "Home", "123 St", "now", "del-123", emptyList())
        
        composeTestRule.setContent {
            OrderDetailScreen(order = order, isLoading = false, onTrackOrderClick = { trackClickedId = it })
        }
        
        composeTestRule.onNodeWithText("Track Order").assertIsDisplayed()
        composeTestRule.onNodeWithText("Track Order").performClick()
        
        assert(trackClickedId == "del-123")
    }

    @Test
    fun testTrackOrderNotAvailableForTerminalStates() {
        val order = Order("1", "shop1", OrderStatus.DELIVERED, "2.00", "5.00", "7.00", "Home", "123 St", "now", "del-123", emptyList())
        
        composeTestRule.setContent {
            OrderDetailScreen(order = order, isLoading = false, onTrackOrderClick = {})
        }
        
        composeTestRule.onNodeWithText("Track Order").assertDoesNotExist()
        composeTestRule.onNodeWithText("Order is DELIVERED. Tracking is no longer available.").assertIsDisplayed()
    }
}
