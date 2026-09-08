package com.smartcart.android.fcm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.smartcart.android.MainActivity
import com.smartcart.shared.auth.AuthRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import com.smartcart.shared.network.createHttpClient
import com.smartcart.shared.auth.SecureStorage
import com.smartcart.shared.auth.AndroidSecureStorage

class SmartCartFirebaseMessagingService : FirebaseMessagingService() {

    private val authRepository: AuthRepository by lazy {
        val secureStorage = AndroidSecureStorage()
        AuthRepository(createHttpClient(secureStorage), secureStorage)
    }
    
    private val serviceScope = CoroutineScope(Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        
        // FCM token callback -> update current platform token
        // If authenticated session exists, we should register it.
        // We will just invoke the repository which handles internal token checks.
        // But for safety, we assume if we are logged in, we can register.
        serviceScope.launch {
            try {
                authRepository.registerPushToken(token, "FCM")
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        val type = data["type"] ?: return
        val entityId = data["entityId"] ?: return
        val deepLink = data["deepLink"] ?: return

        showNotification(type, entityId, deepLink)
    }

    private fun showNotification(type: String, entityId: String, deepLink: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val channelId = "smartcart_main_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "SmartCart Notifications",
                NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(deepLink)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            deepLink.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Simple title/body mapping based on type
        val title = when {
            type.startsWith("order.") -> "Order Update"
            else -> "Smart Cart"
        }
        val body = "Tap to view details"

        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            // Use a default icon since we might not have a specific drawable created yet
            .setSmallIcon(android.R.drawable.ic_dialog_info) 
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)

        notificationManager.notify(entityId.hashCode(), notificationBuilder.build())
    }
}
