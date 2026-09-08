package com.smartcart.android.ui.order

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertIsDisplayed
import com.smartcart.shared.order.domain.Order
import com.smartcart.shared.order.domain.OrderStatus
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import androidx.test.ext.junit.runners.AndroidJUnit4

@RunWith(AndroidJUnit4::class)
class OrderHistoryScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun testLoadingState() {
        composeTestRule.setContent {
            OrderHistoryScreen(orders = emptyList(), isLoading = true, onOrderClick = {})
        }
        composeTestRule.onNodeWithText("No orders found.").assertDoesNotExist()
    }

    @Test
    fun testEmptyState() {
        composeTestRule.setContent {
            OrderHistoryScreen(orders = emptyList(), isLoading = false, onOrderClick = {})
        }
        composeTestRule.onNodeWithText("No orders found.").assertIsDisplayed()
    }

    @Test
    fun testErrorAndRetry() {
        var retryClicked = false
        composeTestRule.setContent {
            OrderHistoryScreen(
                orders = emptyList(),
                isLoading = false,
                errorMessage = "Network error",
                onRetry = { retryClicked = true },
                onOrderClick = {}
            )
        }
        composeTestRule.onNodeWithText("Network error").assertIsDisplayed()
        composeTestRule.onNodeWithText("Retry").performClick()
        assert(retryClicked)
    }

    @Test
    fun testSuccessState() {
        val orders = listOf(
            Order("1", "shop1", OrderStatus.DELIVERED, "10", "2", "12", "Home", "123 St", "now", null)
        )
        composeTestRule.setContent {
            OrderHistoryScreen(orders = orders, isLoading = false, onOrderClick = {})
        }
        composeTestRule.onNodeWithText("Order #1").assertIsDisplayed()
        composeTestRule.onNodeWithText("Status: DELIVERED").assertIsDisplayed()
        composeTestRule.onNodeWithText("Total: \$12").assertIsDisplayed()
    }
}
