package com.smartcart.shared.address.repository

import com.smartcart.shared.address.data.AddressApi
import com.smartcart.shared.address.data.AddressDto
import com.smartcart.shared.address.data.CreateAddressDto
import com.smartcart.shared.address.domain.Address
import com.smartcart.shared.cart.repository.Resource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class AddressRepository(private val api: AddressApi) {
    private val _addressesState = MutableStateFlow<Resource<List<Address>>>(Resource.Loading)
    val addressesState: StateFlow<Resource<List<Address>>> = _addressesState.asStateFlow()

    suspend fun fetchAddresses() {
        _addressesState.value = Resource.Loading
        try {
            val response = api.getAddresses()
            _addressesState.value = Resource.Success(response.data.map { mapToDomain(it) })
        } catch (e: Exception) {
            _addressesState.value = Resource.Error(e)
        }
    }

    suspend fun createAddress(label: String, addressLine: String, latitude: Double, longitude: Double) {
        try {
            api.createAddress(CreateAddressDto(label, addressLine, latitude, longitude))
            fetchAddresses()
        } catch (e: Exception) {
            _addressesState.value = Resource.Error(e)
        }
    }

    suspend fun deleteAddress(addressId: String) {
        try {
            api.deleteAddress(addressId)
            fetchAddresses()
        } catch (e: Exception) {
            _addressesState.value = Resource.Error(e)
        }
    }

    suspend fun setDefaultAddress(addressId: String) {
        try {
            api.setDefaultAddress(addressId)
            fetchAddresses()
        } catch (e: Exception) {
            _addressesState.value = Resource.Error(e)
        }
    }

    private fun mapToDomain(dto: AddressDto): Address {
        return Address(
            id = dto.id,
            label = dto.label,
            addressLine = dto.addressLine,
            latitude = dto.latitude,
            longitude = dto.longitude,
            isDefault = dto.isDefault
        )
    }
}
