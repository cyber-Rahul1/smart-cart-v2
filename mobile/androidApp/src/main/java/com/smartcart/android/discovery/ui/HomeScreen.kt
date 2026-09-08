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
    onShopClick: (String) -> Unit,
    onRetry: () -> Unit
) {
    Scaffold(
        topBar = {
            @OptIn(ExperimentalMaterial3Api::class)
            TopAppBar(title = { Text("SmartCart Discovery") })
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
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
                    
                    if (shops.isEmpty()) {
                        Text("No shops found nearby.", modifier = Modifier.align(Alignment.Center))
                    } else {
                        Column {
                            if (shopsResource.isStale) {
                                Text(
                                    "Showing cached data (network unavailable)",
                                    modifier = Modifier.fillMaxWidth().padding(8.dp),
                                    color = MaterialTheme.colorScheme.secondary
                                )
                            }
                            LazyColumn {
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
