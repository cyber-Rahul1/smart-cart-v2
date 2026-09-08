package com.smartcart.shared.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

lateinit var applicationContext: Context

class AndroidSecureStorage : SecureStorage {
    
    private val sharedPreferences by lazy {
        val masterKey = MasterKey.Builder(applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            applicationContext,
            "secret_shared_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun saveToken(key: String, value: String) {
        sharedPreferences.edit().putString(key, value).apply()
    }

    override fun getToken(key: String): String? {
        return sharedPreferences.getString(key, null)
    }

    override fun clearToken(key: String) {
        sharedPreferences.edit().remove(key).apply()
    }
}

actual fun getSecureStorage(): SecureStorage = AndroidSecureStorage()
