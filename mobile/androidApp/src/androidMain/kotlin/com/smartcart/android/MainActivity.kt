package com.smartcart.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navDeepLink
import com.smartcart.shared.auth.applicationContext
import com.smartcart.shared.notifications.DeepLinkParser
import com.smartcart.shared.notifications.PendingDeepLinkManager

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        com.smartcart.shared.auth.applicationContext = this.applicationContext
        
        handleIntent(intent)

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    SmartCartNavHost()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val data = intent?.dataString ?: return
        val destination = DeepLinkParser.parse(data)
        // For simplicity in MVP, we just store it in the pending manager.
        // A robust app would check if authenticated right here.
        PendingDeepLinkManager.setPendingDestination(destination)
    }
}

@Composable
fun SmartCartNavHost() {
    val navController = rememberNavController()

    // Example of deep link consumption hook (could be placed inside a root layout or ViewModel)
    LaunchedEffect(Unit) {
        PendingDeepLinkManager.pendingDestination.collect { dest ->
            dest?.let {
                when (it) {
                    is DeepLinkParser.Destination.OrderDetail -> {
                        navController.navigate("orderDetail/${it.orderId}")
                    }
                    is DeepLinkParser.Destination.Tracking -> {
                        navController.navigate("tracking/${it.deliveryId}")
                    }
                    is DeepLinkParser.Destination.Notifications -> {
                        navController.navigate("notifications")
                    }
                    DeepLinkParser.Destination.Home -> {
                        navController.navigate("home") {
                            popUpTo(0)
                        }
                    }
                }
                PendingDeepLinkManager.consumePendingDestination()
            }
        }
    }

    NavHost(navController = navController, startDestination = "home") {
        composable("home") {
            Text("Home Screen")
        }
        composable("orderDetail/{orderId}") { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId")
            Text("Order Detail: $orderId")
        }
        composable("tracking/{deliveryId}") { backStackEntry ->
            val deliveryId = backStackEntry.arguments?.getString("deliveryId")
            Text("Tracking: $deliveryId")
        }
        composable("notifications") {
            Text("Notifications History")
        }
    }
}
