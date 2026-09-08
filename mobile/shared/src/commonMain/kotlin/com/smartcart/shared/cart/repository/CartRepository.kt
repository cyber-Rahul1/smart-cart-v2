package com.smartcart.shared.cart.repository

import com.smartcart.shared.cart.data.CartApi
import com.smartcart.shared.cart.data.CartDto
import com.smartcart.shared.cart.domain.Cart
import com.smartcart.shared.cart.domain.CartItem
import com.smartcart.shared.cart.domain.CartShop
import com.smartcart.shared.cart.domain.CartShopConflictError
import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed class Resource<out T> {
    object Loading : Resource<Nothing>()
    data class Success<out T>(val data: T) : Resource<T>()
    data class Error(val exception: Throwable) : Resource<Nothing>()
}

class CartRepository(private val api: CartApi) {
    private val _cartState = MutableStateFlow<Resource<Cart>>(Resource.Loading)
    val cartState: StateFlow<Resource<Cart>> = _cartState.asStateFlow()

    suspend fun fetchCart() {
        _cartState.value = Resource.Loading
        try {
            val response = api.getCart()
            _cartState.value = Resource.Success(mapToDomain(response.data))
        } catch (e: Exception) {
            _cartState.value = Resource.Error(e)
        }
    }

    suspend fun addItem(productId: String, quantity: Int) {
        _cartState.value = Resource.Loading
        try {
            val response = api.addItem(productId, quantity)
            _cartState.value = Resource.Success(mapToDomain(response.data))
        } catch (e: ClientRequestException) {
            if (e.response.status == HttpStatusCode.Conflict) {
                _cartState.value = Resource.Error(CartShopConflictError())
            } else {
                _cartState.value = Resource.Error(e)
            }
        } catch (e: Exception) {
            _cartState.value = Resource.Error(e)
        }
    }

    suspend fun updateItemQuantity(cartItemId: String, quantity: Int) {
        _cartState.value = Resource.Loading
        try {
            val response = api.updateItemQuantity(cartItemId, quantity)
            _cartState.value = Resource.Success(mapToDomain(response.data))
        } catch (e: Exception) {
            _cartState.value = Resource.Error(e)
        }
    }

    suspend fun removeItem(cartItemId: String) {
        _cartState.value = Resource.Loading
        try {
            val response = api.removeItem(cartItemId)
            _cartState.value = Resource.Success(mapToDomain(response.data))
        } catch (e: Exception) {
            _cartState.value = Resource.Error(e)
        }
    }

    suspend fun clearCart() {
        _cartState.value = Resource.Loading
        try {
            val response = api.clearCart()
            _cartState.value = Resource.Success(mapToDomain(response.data))
        } catch (e: Exception) {
            _cartState.value = Resource.Error(e)
        }
    }

    private fun mapToDomain(dto: CartDto): Cart {
        return Cart(
            id = dto.id,
            shop = dto.shop?.let { CartShop(it.id, it.name, it.minimumOrder) },
            items = dto.items.map {
                CartItem(
                    id = it.id,
                    productId = it.productId,
                    name = it.name,
                    image = it.image,
                    quantity = it.quantity,
                    unitPrice = it.unitPrice,
                    lineTotal = it.lineTotal,
                    isAvailable = it.isAvailable,
                    status = it.status
                )
            },
            subtotal = dto.subtotal,
            minimumOrder = dto.minimumOrder,
            remainingAmount = dto.remainingAmount,
            itemCount = dto.itemCount,
            totalQuantity = dto.totalQuantity
        )
    }
}
