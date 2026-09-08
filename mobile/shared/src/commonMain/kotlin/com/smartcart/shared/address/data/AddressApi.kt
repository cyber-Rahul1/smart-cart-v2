package com.smartcart.shared.address.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType

class AddressApi(private val client: HttpClient) {
    suspend fun getAddresses(): AddressesResponseDto {
        return client.get("/users/me/addresses").body()
    }

    suspend fun createAddress(dto: CreateAddressDto): AddressResponseDto {
        return client.post("/users/me/addresses") {
            contentType(ContentType.Application.Json)
            setBody(dto)
        }.body()
    }

    suspend fun updateAddress(addressId: String, dto: CreateAddressDto): AddressResponseDto {
        return client.patch("/users/me/addresses/${addressId}") {
            contentType(ContentType.Application.Json)
            setBody(dto)
        }.body()
    }

    suspend fun deleteAddress(addressId: String) {
        client.delete("/users/me/addresses/${addressId}")
    }

    suspend fun setDefaultAddress(addressId: String): AddressSuccessDto {
        return client.post("/users/me/addresses/${addressId}/default").body()
    }
}
