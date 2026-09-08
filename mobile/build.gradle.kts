buildscript {
    dependencies {
        classpath("org.xerial:sqlite-jdbc:3.46.0.0")
    }
}

plugins {
    // this is necessary to avoid the plugins to be loaded multiple times
    // in each subproject's classloader
    kotlin("multiplatform") version "2.0.20" apply false
    kotlin("plugin.serialization") version "2.0.20" apply false
    id("com.android.application") version "8.2.2" apply false
    id("com.android.library") version "8.2.2" apply false
    id("org.jetbrains.compose") version "1.6.11" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false
    id("com.google.gms.google-services") version "4.4.1" apply false
}
