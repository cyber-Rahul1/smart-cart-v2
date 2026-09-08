package com.smartcart.android.discovery.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartcart.shared.discovery.domain.PaginatedData
import com.smartcart.shared.discovery.domain.Resource
import com.smartcart.shared.discovery.domain.Shop

@Composable
fun HomeScreen(
    shopsResource: Resource<PaginatedData<Shop>>,
    newNearYouResource: Resource<PaginatedData<Shop>>,
    onShopClick: (String) -> Unit,
    onRetry: () -> Unit,
    onLogEvent: (String, Map<String, Any>) -> Unit = { _, _ -> },
    isLocationUnavailable: Boolean = false
) {
    Scaffold(
        topBar = {
            @OptIn(ExperimentalMaterial3Api::class)
            TopAppBar(title = { Text("SmartCart Discovery") })
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (isLocationUnavailable) {
                Column(
                    modifier = Modifier.align(Alignment.Center).padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Location is required to discover nearby shops.",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(onClick = onRetry) {
                        Text("Enable Location / Retry")
                    }
                }
            } else {
                when (shopsResource) {
                is Resource.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                is Resource.Error -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(text = "Error: ${shopsResource.message}", color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = onRetry) {
                            Text("Retry")
                        }
                    }
                }
                is Resource.Success -> {
                    val data = shopsResource.data
                    val shops = data.items
                    
                    Column {
                        if (shopsResource.isStale || newNearYouResource.let { it is Resource.Success && it.isStale }) {
                            Text(
                                "Showing cached data (network unavailable)",
                                modifier = Modifier.fillMaxWidth().padding(8.dp),
                                color = MaterialTheme.colorScheme.secondary
                            )
                        }
                        LazyColumn {
                            item {
                                if (newNearYouResource is Resource.Success) {
                                    val newShops = newNearYouResource.data.items
                                    if (newShops.isNotEmpty()) {
                                        NewNearYouCarousel(
                                            shops = newShops,
                                            onShopClick = onShopClick,
                                            onLogEvent = onLogEvent
                                        )
                                    }
                                }
                            }
                            
                            if (shops.isEmpty()) {
                                item {
                                    Text("No shops found nearby.", modifier = Modifier.padding(16.dp))
                                }
                            } else {
                                items(shops) { shop ->
                                    ShopListItem(shop = shop, onClick = { onShopClick(shop.id) })
                                }
                            }
                        }
                    }
                }
                }
            }
        }
    }
}

@Composable
fun NewNearYouCarousel(
    shops: List<Shop>,
    onShopClick: (String) -> Unit,
    onLogEvent: (String, Map<String, Any>) -> Unit
) {
    androidx.compose.runtime.LaunchedEffect(Unit) {
        onLogEvent("new_business_viewed", mapOf("count" to shops.size))
    }
    
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(
            text = "New Near You",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        )
        androidx.compose.foundation.lazy.LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(shops) { shop ->
                Card(
                    onClick = {
                        onLogEvent("new_business_opened", mapOf("shop_id" to shop.id))
                        onShopClick(shop.id)
                    },
                    modifier = Modifier.width(200.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(text = shop.name, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                        shop.description?.let {
                            Text(text = it, style = MaterialTheme.typography.bodySmall, maxLines = 2)
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(text = "Published: ${shop.publishedAt ?: "Unknown"}", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
fun ShopListItem(shop: Shop, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(8.dp),
        onClick = onClick
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = shop.name, style = MaterialTheme.typography.titleMedium)
            shop.description?.let {
                Text(text = it, style = MaterialTheme.typography.bodyMedium)
            }
            Text(text = "Status: ${shop.status}", style = MaterialTheme.typography.labelSmall)
        }
    }
}
