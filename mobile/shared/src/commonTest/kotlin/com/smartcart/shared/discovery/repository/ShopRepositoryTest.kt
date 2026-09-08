package com.smartcart.shared.discovery.repository

import com.smartcart.shared.cache.SmartCartDatabase
import com.smartcart.shared.cache.createTestDriver
import com.smartcart.shared.discovery.api.DiscoveryService
import com.smartcart.shared.discovery.domain.Resource
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ShopRepositoryTest {

    private fun createMockApi(
        responseJson: String? = null,
        shouldFail: Boolean = false
    ): DiscoveryService {
        val mockEngine = MockEngine { _ ->
            if (shouldFail) {
                respondError(HttpStatusCode.InternalServerError)
            } else {
                respond(
                    content = responseJson ?: "",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        return DiscoveryService(client, "http://localhost:3000")
    }

    private val sampleJson = """
        {
          "success": true,
          "data": [
            {
              "id": "shop-1",
              "ownerId": "owner-1",
              "name": "New Shop",
              "latitude": 40.7128,
              "longitude": -74.0060,
              "location": { "type": "Point", "coordinates": [-74.0060, 40.7128] },
              "deliveryRadius": 5000,
              "minimumOrder": 10,
              "preparationTime": 30,
              "status": "ACTIVE",
              "publishedAt": "2026-09-01T00:00:00Z",
              "createdAt": "2026-09-01T00:00:00Z",
              "updatedAt": "2026-09-01T00:00:00Z"
            }
          ],
          "meta": {
            "nextCursor": "cursor123"
          }
        }
    """.trimIndent()

    class FakeClock(var currentTime: Instant) : Clock {
        override fun now(): Instant = currentTime
    }

    @Test
    fun testGetNewNearYou_NetworkSuccess_FirstPage() = runTest {
        val db = SmartCartDatabase(createTestDriver())
        val api = createMockApi(sampleJson)
        val clock = FakeClock(Clock.System.now())
        val repo = ShopRepository(api, db, clock)

        val results = repo.getNewNearYou(lat = 40.71281, lng = -74.00602, radius = 5000, limit = 20, cursor = null).toList()

        assertEquals(2, results.size)
        assertTrue(results[0] is Resource.Loading)
        assertTrue(results[1] is Resource.Success)

        val data = (results[1] as Resource.Success).data
        assertEquals(1, data.items.size)
        assertEquals("shop-1", data.items[0].id)
        assertEquals("cursor123", data.nextCursor)
        
        // Test quantization (40.71281 -> 40.712, -74.00602 -> -74.006)
        val cacheKey = "new_near_you_40.712_-74.006_5000_20_first"
        val cached = db.databaseQueries.getBrowseCache(cacheKey).executeAsOneOrNull()
        assertTrue(cached != null)
        assertEquals("shop-1", cached.ids)
    }
    
    @Test
    fun testGetNewNearYou_NetworkSuccess_CursorPage() = runTest {
        val db = SmartCartDatabase(createTestDriver())
        val api = createMockApi(sampleJson)
        val clock = FakeClock(Clock.System.now())
        val repo = ShopRepository(api, db, clock)

        repo.getNewNearYou(lat = 40.712, lng = -74.006, radius = 5000, limit = 20, cursor = "cursor123").toList()
        
        val cacheKey = "new_near_you_40.712_-74.006_5000_20_cursor123"
        val cached = db.databaseQueries.getBrowseCache(cacheKey).executeAsOneOrNull()
        assertTrue(cached != null)
    }

    @Test
    fun testGetNewNearYou_NetworkFailure_StaleCacheFallback() = runTest {
        val db = SmartCartDatabase(createTestDriver())
        val clock = FakeClock(Clock.System.now())
        
        val staleTime = clock.now().toEpochMilliseconds() - (20 * 60 * 1000L) // 20 mins old (stale for new near you)
        db.databaseQueries.insertShop(
            id = "shop-2", ownerId = "owner", name = "Cached Shop", description = null,
            latitude = 40.712, longitude = -74.006, logo = null, banner = null, deliveryRadius = 5000,
            minimumOrder = 10.0, preparationTime = 15, status = "ACTIVE", publishedAt = null,
            createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z", deletedAt = null, lastUpdated = staleTime
        )
        val cacheKey = "new_near_you_40.712_-74.006_5000_20_first"
        db.databaseQueries.insertBrowseCache(cacheKey, "shop-2", staleTime)

        val api = createMockApi(shouldFail = true)
        val repo = ShopRepository(api, db, clock)

        val results = repo.getNewNearYou(lat = 40.712, lng = -74.006, radius = 5000, limit = 20, cursor = null).toList()

        assertEquals(2, results.size)
        assertTrue(results[1] is Resource.Success)
        val success = results[1] as Resource.Success
        assertTrue(success.isStale)
        assertEquals("shop-2", success.data.items[0].id)
    }
    
    @Test
    fun testGetNewNearYou_DifferentRadius_DifferentKey() = runTest {
        val db = SmartCartDatabase(createTestDriver())
        val api = createMockApi(sampleJson)
        val clock = FakeClock(Clock.System.now())
        val repo = ShopRepository(api, db, clock)

        repo.getNewNearYou(lat = 40.712, lng = -74.006, radius = 3000, limit = 20, cursor = null).toList()
        
        val cacheKey1 = "new_near_you_40.712_-74.006_3000_20_first"
        assertTrue(db.databaseQueries.getBrowseCache(cacheKey1).executeAsOneOrNull() != null)
        
        val cacheKey2 = "new_near_you_40.712_-74.006_5000_20_first"
        assertTrue(db.databaseQueries.getBrowseCache(cacheKey2).executeAsOneOrNull() == null)
    }
}
