package com.smartcart.shared.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class ExactMoneySerializerTest {

    @Serializable
    data class TestMoneyDto(
        @Serializable(with = ExactMoneySerializer::class)
        val amount: String
    )

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun testExactMoneyDeserialization() {
        // Test values that could potentially suffer from float precision loss if parsed as Double
        val jsonPayloads = listOf(
            """{"amount":10.00}""" to "10.00",
            """{"amount":10.50}""" to "10.50",
            """{"amount":999999.99}""" to "999999.99",
            """{"amount":0.01}""" to "0.01",
            """{"amount":123456789.123456789}""" to "123456789.123456789" // Extreme precision check
        )

        for ((payload, expected) in jsonPayloads) {
            val decoded = json.decodeFromString(TestMoneyDto.serializer(), payload)
            assertEquals(expected, decoded.amount, "Failed to preserve exact string for payload: $payload")
        }
    }
}
