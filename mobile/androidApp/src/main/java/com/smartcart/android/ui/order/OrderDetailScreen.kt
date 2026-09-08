package com.smartcart.android.ui.order

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartcart.shared.order.domain.Order

@Composable
fun OrderDetailScreen(
    order: Order?,
    isLoading: Boolean,
    onTrackOrderClick: (String) -> Unit
) {
    if (isLoading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    if (order == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
            Text("Order not found.")
        }
        return
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Order #${order.id}", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(8.dp))
        Text("Status: ${order.status}", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(16.dp))
        
        Text("Delivery Address:", style = MaterialTheme.typography.labelLarge)
        Text("${order.deliveryAddressLabel} - ${order.deliveryAddressLine}")
        Spacer(modifier = Modifier.height(16.dp))
        
        order.items?.let { items ->
            if (items.isNotEmpty()) {
                Text("Items:", style = MaterialTheme.typography.labelLarge)
                items.forEach { item ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${item.quantity}x ${item.productName}")
                        Text("\$${item.lineTotal}")
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }
        }

        Text("Subtotal: \$${order.subtotal}")
        Text("Delivery Fee: \$${order.deliveryFee}")
        Text("Total: \$${order.totalAmount}", style = MaterialTheme.typography.titleMedium)
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Track Order eligibility
        val isTrackable = order.deliveryId != null && !order.status.isTerminal()
        if (isTrackable) {
            Button(
                onClick = { order.deliveryId?.let { onTrackOrderClick(it) } },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Track Order")
            }
        } else if (order.status.isTerminal()) {
            Text("Order is ${order.status}. Tracking is no longer available.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
