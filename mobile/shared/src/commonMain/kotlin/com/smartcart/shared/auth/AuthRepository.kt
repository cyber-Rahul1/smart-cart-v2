package com.smartcart.shared.auth

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody

class AuthRepository(
    private val httpClient: HttpClient,
    private val secureStorage: SecureStorage
) {
    suspend fun sendOtp(phoneNumber: String): Result<String> {
        return try {
            val response: SendOtpResponse = httpClient.post("/auth/otp/send") {
                setBody(SendOtpRequest(phoneNumber))
            }.body()
            Result.success(response.message)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun verifyOtp(phoneNumber: String, code: String, deviceId: String, platform: String): Result<UserInfo> {
        return try {
            val response: VerifyOtpResponse = httpClient.post("/auth/otp/verify") {
                setBody(VerifyOtpRequest(phoneNumber, code, platform, deviceId))
            }.body()

            secureStorage.saveToken("access_token", response.accessToken)
            secureStorage.saveToken("refresh_token", response.refreshToken)
            secureStorage.saveToken("device_id", deviceId)

            Result.success(response.user)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logout(): Result<Unit> {
        return try {
            httpClient.post("/auth/logout")
            secureStorage.clearToken("access_token")
            secureStorage.clearToken("refresh_token")
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun registerPushToken(pushToken: String, pushProvider: String): Result<Unit> {
        return try {
            val deviceId = secureStorage.getToken("device_id") 
                ?: return Result.failure(Exception("Device ID not found"))
            
            httpClient.patch("/users/me/devices/$deviceId/push-token") {
                setBody(UpdatePushTokenRequest(pushToken, pushProvider))
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
