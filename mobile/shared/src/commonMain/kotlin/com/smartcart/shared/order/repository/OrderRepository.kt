package com.smartcart.shared.order.repository

import com.smartcart.shared.cart.repository.Resource
import com.smartcart.shared.order.data.CreateOrderDto
import com.smartcart.shared.order.data.OrderApi
import com.smartcart.shared.order.data.OrderResponseDto
import com.smartcart.shared.order.domain.Order
import com.smartcart.shared.order.domain.OrderStatus

open class OrderRepository(private val api: OrderApi) {
    open suspend fun createOrder(addressId: String, idempotencyKey: String): Resource<Order> {
        return try {
            val response = api.createOrder(CreateOrderDto(addressId, idempotencyKey))
            Resource.Success(mapToDomain(response.data))
        } catch (e: Exception) {
            Resource.Error(e)
        }
    }

    open suspend fun getOrder(id: String): Resource<Order> {
        return try {
            val response = api.getOrder(id)
            Resource.Success(mapToDomain(response.data))
        } catch (e: Exception) {
            Resource.Error(e)
        }
    }

    open suspend fun getOrders(): Resource<List<Order>> {
        return try {
            val response = api.getOrders()
            Resource.Success(response.data.map { mapToDomain(it) })
        } catch (e: Exception) {
            Resource.Error(e)
        }
    }

    private fun mapToDomain(dto: OrderResponseDto): Order {
        return Order(
            id = dto.id,
            shopId = dto.shopId,
            status = OrderStatus.fromString(dto.status),
            subtotal = dto.subtotal,
            deliveryFee = dto.deliveryFee,
            totalAmount = dto.totalAmount,
            deliveryAddressLabel = dto.deliveryAddressLabel,
            deliveryAddressLine = dto.deliveryAddressLine,
            createdAt = dto.createdAt,
            deliveryId = dto.deliveryId,
            items = dto.items?.map { itemDto ->
                com.smartcart.shared.order.domain.OrderItem(
                    id = itemDto.id,
                    productId = itemDto.productId,
                    productName = itemDto.productNameSnapshot,
                    unitPrice = itemDto.unitPriceSnapshot,
                    quantity = itemDto.quantity,
                    lineTotal = itemDto.lineTotal
                )
            }
        )
    }
}
