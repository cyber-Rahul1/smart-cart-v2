package com.smartcart.android.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smartcart.shared.auth.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID
import com.google.firebase.messaging.FirebaseMessaging

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    object OtpSent : AuthState()
    object Success : AuthState()
    data class Error(val message: String) : AuthState()
}

class AuthViewModel(private val authRepository: AuthRepository) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private var currentPhone: String = ""
    
    // In a real app, deviceId should be persisted or generated once per install
    private val deviceId = UUID.randomUUID().toString() 

    fun sendOtp(phoneNumber: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            currentPhone = phoneNumber
            val result = authRepository.sendOtp(phoneNumber)
            if (result.isSuccess) {
                _authState.value = AuthState.OtpSent
            } else {
                _authState.value = AuthState.Error(result.exceptionOrNull()?.message ?: "Unknown error")
            }
        }
    }

    fun verifyOtp(code: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            val result = authRepository.verifyOtp(currentPhone, code, deviceId, "android")
            if (result.isSuccess) {
                // Register push token immediately after successful login using actual FCM token
                try {
                    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                        if (task.isSuccessful) {
                            val token = task.result
                            viewModelScope.launch {
                                authRepository.registerPushToken(token, "FCM")
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Firebase might not be initialized if google-services.json is missing in this test env
                    e.printStackTrace()
                }
                
                _authState.value = AuthState.Success
            } else {
                _authState.value = AuthState.Error(result.exceptionOrNull()?.message ?: "Unknown error")
            }
        }
    }
}
