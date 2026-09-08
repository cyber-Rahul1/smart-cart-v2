package com.smartcart.shared.address

import com.smartcart.shared.address.data.AddressApi
import com.smartcart.shared.address.repository.AddressRepository
import com.smartcart.shared.cart.repository.Resource
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AddressRepositoryTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun createRepository(mockEngine: MockEngine): AddressRepository {
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(json)
            }
        }
        val api = AddressApi(client)
        return AddressRepository(api)
    }

    @Test
    fun testFetchAddresses() = runTest {
        val mockEngine = MockEngine { request ->
            respond(
                content = """{
                    "success": true,
                    "data": [
                        {
                            "id": "addr-1",
                            "label": "Home",
                            "addressLine": "123 Test St",
                            "latitude": 12.34,
                            "longitude": 56.78,
                            "isDefault": true
                        }
                    ]
                }""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }
        val repo = createRepository(mockEngine)
        
        repo.fetchAddresses()
        val state = repo.addressesState.value
        
        assertTrue(state is Resource.Success)
        val addresses = state.data
        assertEquals(1, addresses.size)
        assertEquals("Home", addresses[0].label)
    }
}
