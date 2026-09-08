package com.smartcart.android.discovery.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.smartcart.shared.discovery.domain.Category
import com.smartcart.shared.discovery.domain.Product
import com.smartcart.shared.discovery.domain.Resource
import com.smartcart.shared.discovery.domain.Shop

@Composable
fun ShopDetailScreen(
    shopResource: Resource<Shop>,
    categoriesResource: Resource<List<Category>>,
    productsResource: Resource<List<Product>>,
    onRetry: () -> Unit,
    onBack: () -> Unit
) {
    Scaffold(
        topBar = {
            @OptIn(ExperimentalMaterial3Api::class)
            TopAppBar(title = { Text("Shop Details") })
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (shopResource) {
                is Resource.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                is Resource.Error -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(text = "Error: ${shopResource.message}", color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = onRetry) { Text("Retry") }
                    }
                }
                is Resource.Success -> {
                    val shop = shopResource.data
                    Column(modifier = Modifier.padding(16.dp)) {
                        if (shopResource.isStale) {
                            Text("Showing cached data", color = MaterialTheme.colorScheme.secondary)
                        }
                        Text(text = shop.name, style = MaterialTheme.typography.headlineMedium)
                        shop.description?.let { Text(text = it, style = MaterialTheme.typography.bodyLarge) }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(text = "Categories", style = MaterialTheme.typography.titleLarge)
                        
                        when (categoriesResource) {
                            is Resource.Loading -> CircularProgressIndicator()
                            is Resource.Error -> Text("Failed to load categories")
                            is Resource.Success -> {
                                val categories = categoriesResource.data
                                if (categories.isEmpty()) Text("No categories")
                                else {
                                    LazyColumn(modifier = Modifier.heightIn(max = 150.dp)) {
                                        items(categories) { cat ->
                                            Text("- ${cat.name}", modifier = Modifier.padding(vertical = 4.dp))
                                        }
                                    }
                                }
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(text = "Products", style = MaterialTheme.typography.titleLarge)
                        
                        when (productsResource) {
                            is Resource.Loading -> CircularProgressIndicator()
                            is Resource.Error -> Text("Failed to load products")
                            is Resource.Success -> {
                                val products = productsResource.data
                                if (products.isEmpty()) Text("No products")
                                else {
                                    LazyColumn {
                                        items(products) { product ->
                                            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                                Column(modifier = Modifier.padding(8.dp)) {
                                                    Text(text = product.name, style = MaterialTheme.typography.titleMedium)
                                                    Text(text = "$${product.price}", style = MaterialTheme.typography.bodyMedium)
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
        }
    }
}
