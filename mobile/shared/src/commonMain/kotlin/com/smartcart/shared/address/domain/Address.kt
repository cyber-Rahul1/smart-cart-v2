package com.smartcart.shared.address.domain

data class Address(
    val id: String,
    val label: String,
    val addressLine: String,
    val latitude: Double,
    val longitude: Double,
    val isDefault: Boolean
)
