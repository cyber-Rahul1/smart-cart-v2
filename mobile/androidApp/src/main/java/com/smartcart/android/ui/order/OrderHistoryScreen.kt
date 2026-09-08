package com.smartcart.android.ui.order

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartcart.shared.order.domain.Order

@Composable
fun OrderHistoryScreen(
    orders: List<Order>,
    isLoading: Boolean,
    errorMessage: String? = null,
    onRetry: () -> Unit = {},
    onOrderClick: (String) -> Unit
) {
    if (isLoading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    if (errorMessage != null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
            Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                Text(text = errorMessage, color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = onRetry) {
                    Text("Retry")
                }
            }
        }
        return
    }

    if (orders.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
            Text("No orders found.")
        }
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(orders) { order ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp)
                    .clickable { onOrderClick(order.id) }
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Order #${order.id}", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Status: ${order.status}")
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Total: \$${order.totalAmount}")
                }
            }
        }
    }
}
