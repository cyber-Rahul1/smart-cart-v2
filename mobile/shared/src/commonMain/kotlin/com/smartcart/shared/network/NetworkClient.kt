package com.smartcart.shared.network

import com.smartcart.shared.auth.RefreshTokenRequest
import com.smartcart.shared.auth.RefreshTokenResponse
import com.smartcart.shared.auth.SecureStorage
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.auth.Auth
import io.ktor.client.plugins.auth.providers.BearerTokens
import io.ktor.client.plugins.auth.providers.bearer
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

// Using localhost / 10.0.2.2 for basic emulator testing initially
const val BASE_URL = "http://10.0.2.2:3000/api/v1"

fun createHttpClient(secureStorage: SecureStorage): HttpClient {
    val mutex = Mutex()

    return HttpClient {
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                isLenient = true
                ignoreUnknownKeys = true
            })
        }

        defaultRequest {
            url(BASE_URL)
            contentType(ContentType.Application.Json)
        }

        install(Auth) {
            bearer {
                loadTokens {
                    val access = secureStorage.getToken("access_token")
                    val refresh = secureStorage.getToken("refresh_token")
                    if (access != null && refresh != null) {
                        BearerTokens(access, refresh)
                    } else null
                }
                
                refreshTokens {
                    mutex.withLock {
                        val currentAccess = secureStorage.getToken("access_token")
                        val currentRefresh = secureStorage.getToken("refresh_token")
                        val deviceId = secureStorage.getToken("device_id")

                        if (currentAccess != null && currentAccess != oldTokens?.accessToken && currentRefresh != null) {
                            // Another request already refreshed the token while we were waiting
                            return@withLock BearerTokens(currentAccess, currentRefresh)
                        }

                        if (currentRefresh == null || deviceId == null) {
                            return@withLock null
                        }

                        try {
                            // Create a separate client to avoid infinite loops with the auth plugin
                            val refreshClient = HttpClient {
                                install(ContentNegotiation) {
                                    json(Json { ignoreUnknownKeys = true })
                                }
                            }
                            
                            val response: RefreshTokenResponse = refreshClient.post("$BASE_URL/auth/refresh") {
                                contentType(ContentType.Application.Json)
                                setBody(RefreshTokenRequest(currentRefresh, deviceId))
                            }.body()

                            secureStorage.saveToken("access_token", response.accessToken)
                            secureStorage.saveToken("refresh_token", response.refreshToken)

                            BearerTokens(response.accessToken, response.refreshToken)
                        } catch (e: Exception) {
                            // On failure to refresh (e.g., session revoked), clear tokens
                            secureStorage.clearToken("access_token")
                            secureStorage.clearToken("refresh_token")
                            null
                        }
                    }
                }
            }
        }
    }
}
