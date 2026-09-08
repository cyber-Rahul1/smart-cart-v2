plugins {
    id("com.android.application")
    kotlin("multiplatform")
    kotlin("plugin.serialization")
    id("org.jetbrains.compose")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

kotlin {
    androidTarget {
        compilations.all {
            kotlinOptions {
                jvmTarget = "17"
            }
        }
    }
    
    sourceSets {
        androidMain.dependencies {
            implementation(project(":shared"))
            implementation(compose.ui)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.uiTooling)
            implementation("androidx.activity:activity-compose:1.9.0")
            implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
            implementation("androidx.navigation:navigation-compose:2.7.7")
            implementation("com.google.firebase:firebase-messaging:23.4.0")
            implementation("com.razorpay:checkout:1.6.33")
            implementation("io.ktor:ktor-client-core:2.3.12")
            implementation("io.socket:socket.io-client:2.1.0")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.1")
        }
        val androidInstrumentedTest by getting {
            dependencies {
                implementation("androidx.test:runner:1.6.2")
                implementation("androidx.test:core:1.6.1")
                implementation("androidx.test.espresso:espresso-core") {
                    version { strictly("3.7.0") }
                }
                implementation("androidx.test.espresso:espresso-idling-resource") {
                    version { strictly("3.7.0") }
                }
                implementation(kotlin("test"))
                implementation("androidx.test.ext:junit:1.1.5")
                implementation("androidx.compose.ui:ui-test-junit4:1.7.0")
            }
        }
    }
}

android {
    namespace = "com.smartcart.android"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.smartcart.android"
        minSdk = 24
        targetSdk = 33
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}


dependencies {
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.7.0")
}
