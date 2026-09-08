package com.smartcart.android.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun AuthScreen(
    viewModel: AuthViewModel,
    onAuthSuccess: () -> Unit
) {
    val authState by viewModel.authState.collectAsState()
    var phoneNumber by remember { mutableStateOf("") }
    var otpCode by remember { mutableStateOf("") }

    LaunchedEffect(authState) {
        if (authState is AuthState.Success) {
            onAuthSuccess()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (authState is AuthState.Error) {
            Text(
                text = (authState as AuthState.Error).message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(bottom = 16.dp)
            )
        }

        if (authState == AuthState.Idle || authState is AuthState.Error || authState == AuthState.Loading && otpCode.isEmpty()) {
            OutlinedTextField(
                value = phoneNumber,
                onValueChange = { phoneNumber = it },
                label = { Text("Phone Number") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = { viewModel.sendOtp(phoneNumber) },
                enabled = phoneNumber.isNotBlank() && authState != AuthState.Loading,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (authState == AuthState.Loading) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                } else {
                    Text("Send OTP")
                }
            }
        } else if (authState == AuthState.OtpSent || authState == AuthState.Loading) {
            OutlinedTextField(
                value = otpCode,
                onValueChange = { otpCode = it },
                label = { Text("OTP Code") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = { viewModel.verifyOtp(otpCode) },
                enabled = otpCode.isNotBlank() && authState != AuthState.Loading,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (authState == AuthState.Loading) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                } else {
                    Text("Verify & Login")
                }
            }
        }
    }
}
