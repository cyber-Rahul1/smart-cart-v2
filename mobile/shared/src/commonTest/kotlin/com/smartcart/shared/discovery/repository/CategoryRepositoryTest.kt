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

class CategoryRepositoryTest {

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
              "id": "cat-1",
              "shopId": "shop-1",
              "name": "Groceries",
              "createdAt": "2026-01-01T00:00:00Z",
              "updatedAt": "2026-01-01T00:00:00Z"
            }
          ]
        }
    """.trimIndent()

    class FakeClock(var currentTime: Instant) : Clock {
        override fun now(): Instant = currentTime
    }

    @Test
    fun testNoCacheAndNetworkSuccess() = runTest {
        val db = SmartCartDatabase(createTestDriver())
        val api = createMockApi(sampleJson)
        val repo = CategoryRepository(api, db)

        val results = repo.getCategories("shop-1").toList()

        assertEquals(2, results.size)
        assertTrue(results[0] is Resource.Loading)
        assertTrue(results[1] is Resource.Success)

        val data = (results[1] as Resource.Success).data
        assertEquals(1, data.size)
        assertEquals("cat-1", data[0].id)
        
        // Verify SQLDelight insertion
        val cached = db.databaseQueries.getCategoriesByShopId("shop-1").executeAsList()
        assertEquals(1, cached.size)
        assertEquals("cat-1", cached[0].id)
    }

    @Test
    fun testFreshCacheHit() = runTest {
        val db = SmartCartDatabase(createTestDriver())
        val clock = FakeClock(Clock.System.now())
        // Insert a fresh cache
        db.databaseQueries.insertCategory(
            id = "cat-2", shopId = "shop-1", name = "Drinks", description = null,
            createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z", deletedAt = null,
            lastUpdated = clock.now().toEpochMilliseconds()
        )

        val api = createMockApi(shouldFail = true) // Network will fail if called
        val repo = CategoryRepository(api, db, clock)

        val results = repo.getCategories("shop-1").toList()

        assertEquals(2, results.size)
        assertTrue(results[0] is Resource.Loading)
        assertTrue(results[1] is Resource.Success)

        val success = results[1] as Resource.Success
        assertEquals(false, success.isStale)
        assertEquals(1, success.data.size)
        assertEquals("cat-2", success.data[0].id)
    }

    @Test
    fun testStaleCacheAndNetworkRefresh() = runTest {
        val db = SmartCartDatabase(createTestDriver())
        val clock = FakeClock(Clock.System.now())
        
        // Insert stale cache (older than 24h)
        val staleTime = clock.now().toEpochMilliseconds() - (25 * 60 * 60 * 1000L)
        db.databaseQueries.insertCategory(
            id = "cat-old", shopId = "shop-1", name = "Old", description = null,
            createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z", deletedAt = null,
            lastUpdated = staleTime
        )

        // API will return new data
        val api = createMockApi(sampleJson)
        val repo = CategoryRepository(api, db, clock)

        val results = repo.getCategories("shop-1").toList()

        assertEquals(2, results.size)
        assertTrue(results[0] is Resource.Loading)
        assertTrue(results[1] is Resource.Success)
        
        val success = results[1] as Resource.Success
        assertEquals(false, success.isStale) // Got fresh network data
        assertEquals(1, success.data.size)
        assertEquals("cat-1", success.data[0].id) // Cache was replaced with new data
        
        // Verify old cache was cleared
        val cached = db.databaseQueries.getCategoriesByShopId("shop-1").executeAsList()
        assertEquals(1, cached.size)
        assertEquals("cat-1", cached[0].id)
    }

    @Test
    fun testStaleCacheAndNetworkFailure() = runTest {
        val db = SmartCartDatabase(createTestDriver())
        val clock = FakeClock(Clock.System.now())
        
        // Insert stale cache
        val staleTime = clock.now().toEpochMilliseconds() - (25 * 60 * 60 * 1000L)
        db.databaseQueries.insertCategory(
            id = "cat-old", shopId = "shop-1", name = "Old", description = null,
            createdAt = "2026-01-01T00:00:00Z", updatedAt = "2026-01-01T00:00:00Z", deletedAt = null,
            lastUpdated = staleTime
        )

        val api = createMockApi(shouldFail = true)
        val repo = CategoryRepository(api, db, clock)

        val results = repo.getCategories("shop-1").toList()

        assertEquals(2, results.size)
        assertTrue(results[0] is Resource.Loading)
        assertTrue(results[1] is Resource.Success)
        
        val success = results[1] as Resource.Success
        assertEquals(true, success.isStale) // Network failed, returning stale cache
        assertEquals(1, success.data.size)
        assertEquals("cat-old", success.data[0].id)
    }

    @Test
    fun testNoCacheAndNetworkFailure() = runTest {
        val db = SmartCartDatabase(createTestDriver())
        val clock = FakeClock(Clock.System.now())

        val api = createMockApi(shouldFail = true)
        val repo = CategoryRepository(api, db, clock)

        val results = repo.getCategories("shop-1").toList()

        assertEquals(2, results.size)
        assertTrue(results[0] is Resource.Loading)
        assertTrue(results[1] is Resource.Error) // No cache + Network fail = Error
    }
}
