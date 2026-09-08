plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
    id("com.android.library")
    id("app.cash.sqldelight") version "2.0.2"
}

sqldelight {
    databases {
        create("SmartCartDatabase") {
            packageName.set("com.smartcart.shared.cache")
            verifyMigrations.set(false)
        }
    }
}

tasks.withType<app.cash.sqldelight.gradle.VerifyMigrationTask>().configureEach {
    enabled = false
}

kotlin {
    androidTarget {
        compilations.all {
            kotlinOptions {
                jvmTarget = "17"
            }
        }
    }
    
    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach {
        it.binaries.framework {
            baseName = "shared"
            isStatic = true
        }
    }

    sourceSets {
        val ktorVersion = "2.3.12"
        val coroutinesVersion = "1.9.0-RC"
        
        commonMain.dependencies {
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")
            
            implementation("io.ktor:ktor-client-core:$ktorVersion")
            implementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")
            implementation("io.ktor:ktor-client-auth:$ktorVersion")
            implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
            
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.1")
            implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.0")
            
            val sqlDelightVersion = "2.0.2"
            implementation("app.cash.sqldelight:coroutines-extensions:$sqlDelightVersion")
        }
        
        androidMain.dependencies {
            implementation("io.ktor:ktor-client-cio:$ktorVersion")
            implementation("androidx.security:security-crypto:1.1.0-alpha06")
            val sqlDelightVersion = "2.0.2"
            implementation("app.cash.sqldelight:android-driver:$sqlDelightVersion")
        }
        
        iosMain.dependencies {
            implementation("io.ktor:ktor-client-darwin:$ktorVersion")
            val sqlDelightVersion = "2.0.2"
            implementation("app.cash.sqldelight:native-driver:$sqlDelightVersion")
        }
        
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation("io.ktor:ktor-client-mock:$ktorVersion")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:$coroutinesVersion")
        }
        
        val androidUnitTest by getting {
            dependencies {
                implementation("app.cash.sqldelight:sqlite-driver:2.0.2")
            }
        }
    }
}

android {
    namespace = "com.smartcart.shared"
    compileSdk = 34
    
    defaultConfig {
        minSdk = 24
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
