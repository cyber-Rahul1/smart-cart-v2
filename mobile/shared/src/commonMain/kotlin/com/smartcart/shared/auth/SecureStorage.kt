package com.smartcart.shared.auth

interface SecureStorage {
    fun saveToken(key: String, value: String)
    fun getToken(key: String): String?
    fun clearToken(key: String)
}

expect fun getSecureStorage(): SecureStorage
