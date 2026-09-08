package com.smartcart.shared.core

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive

/**
 * Serializer that decodes a JSON numeric primitive strictly into a String,
 * preventing any IEEE 754 precision loss that would occur if parsed into Double first.
 */
object ExactMoneySerializer : KSerializer<String> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("ExactMoney", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): String {
        return if (decoder is JsonDecoder) {
            val jsonElement = decoder.decodeJsonElement()
            if (jsonElement !is JsonPrimitive) {
                throw IllegalArgumentException("Expected JsonPrimitive, got ${jsonElement::class.simpleName}")
            }
            jsonElement.content
        } else {
            decoder.decodeString()
        }
    }

    override fun serialize(encoder: Encoder, value: String) {
        encoder.encodeString(value)
    }
}
