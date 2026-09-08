package com.smartcart.shared.auth

import kotlinx.serialization.Serializable

@Serializable
data class SendOtpRequest(val phoneNumber: String)

@Serializable
data class SendOtpResponse(val message: String)

@Serializable
data class VerifyOtpRequest(
    val phoneNumber: String,
    val code: String,
    val platform: String,
    val deviceId: String
)

@Serializable
data class VerifyOtpResponse(
    val user: UserInfo,
    val accessToken: String,
    val refreshToken: String
)

@Serializable
data class UserInfo(
    val id: String,
    val roles: List<String>
)

@Serializable
data class RefreshTokenRequest(
    val refreshToken: String,
    val deviceId: String
)

@Serializable
data class RefreshTokenResponse(
    val accessToken: String,
    val refreshToken: String
)

@Serializable
data class UpdatePushTokenRequest(
    val pushToken: String,
    val pushProvider: String
)
