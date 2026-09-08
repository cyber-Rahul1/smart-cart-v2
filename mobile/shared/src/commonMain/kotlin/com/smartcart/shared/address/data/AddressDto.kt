package com.smartcart.shared.address.data

import kotlinx.serialization.Serializable

@Serializable
data class AddressDto(
    val id: String,
    val label: String,
    val addressLine: String,
    val latitude: Double,
    val longitude: Double,
    val isDefault: Boolean
)

@Serializable
data class CreateAddressDto(
    val label: String,
    val addressLine: String,
    val latitude: Double,
    val longitude: Double
)

@Serializable
data class AddressResponseDto(
    val success: Boolean,
    val data: AddressDto
)

@Serializable
data class AddressesResponseDto(
    val success: Boolean,
    val data: List<AddressDto>
)

@Serializable
data class AddressSuccessDto(
    val success: Boolean
)
