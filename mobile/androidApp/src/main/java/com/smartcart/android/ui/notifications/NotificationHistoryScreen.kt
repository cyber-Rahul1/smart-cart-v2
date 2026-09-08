package com.smartcart.android.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.smartcart.shared.notifications.Notification
import com.smartcart.shared.notifications.NotificationRepository
import kotlinx.coroutines.launch

@Composable
fun NotificationHistoryScreen(
    repository: NotificationRepository,
    onNotificationClick: (Notification) -> Unit,
    modifier: Modifier = Modifier
) {
    val notifications by repository.notifications.collectAsState()
    val scope = rememberCoroutineScope()
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        isLoading = true
        val result = repository.getHistory()
        if (result.isFailure) {
            errorMessage = result.exceptionOrNull()?.message ?: "Failed to load"
        }
        isLoading = false
    }

    if (isLoading) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    if (errorMessage != null) {
        Column(
            modifier = modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Error: $errorMessage", color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = {
                scope.launch {
                    isLoading = true
                    errorMessage = null
                    val res = repository.getHistory()
                    if (res.isFailure) errorMessage = "Failed again"
                    isLoading = false
                }
            }) {
                Text("Retry")
            }
        }
        return
    }

    if (notifications.isEmpty()) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No notifications yet.")
        }
        return
    }

    LazyColumn(modifier = modifier.fillMaxSize()) {
        items(notifications) { notif ->
            NotificationItem(
                notification = notif,
                onClick = {
                    if (!notif.isRead) {
                        scope.launch {
                            repository.markAsRead(notif.id)
                        }
                    }
                    onNotificationClick(notif)
                }
            )
            Divider()
        }
    }
}

@Composable
fun NotificationItem(
    notification: Notification,
    onClick: () -> Unit
) {
    val backgroundColor = if (notification.isRead) {
        MaterialTheme.colorScheme.surface
    } else {
        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(backgroundColor)
            .clickable { onClick() }
            .padding(16.dp)
    ) {
        Text(
            text = notification.title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = if (notification.isRead) FontWeight.Normal else FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = notification.body,
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = notification.createdAt,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
