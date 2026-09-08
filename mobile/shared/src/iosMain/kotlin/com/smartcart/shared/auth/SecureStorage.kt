package com.smartcart.shared.auth

class IosSecureStorage : SecureStorage {
    private val storage = mutableMapOf<String, String>()

    override fun saveToken(key: String, value: String) {
        storage[key] = value
    }

    override fun getToken(key: String): String? {
        return storage[key]
    }

    override fun clearToken(key: String) {
        storage.remove(key)
    }
}

actual fun getSecureStorage(): SecureStorage = IosSecureStorage()
