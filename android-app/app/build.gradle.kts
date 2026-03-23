plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.ksp)
    alias(libs.plugins.google.services) apply false
}

fun Project.resolveConfigValue(key: String, defaultValue: String): String {
    val fromGradleProperty = findProperty(key)?.toString()?.takeIf { it.isNotBlank() }
    val fromEnvironment = providers.environmentVariable(key).orNull?.takeIf { it.isNotBlank() }
    val fromDotEnv = rootProject.file(".env")
        .takeIf { it.exists() }
        ?.readLines()
        ?.firstNotNullOfOrNull { line ->
            val trimmed = line.trim()
            if (trimmed.isBlank() || trimmed.startsWith("#") || !trimmed.contains("=")) {
                return@firstNotNullOfOrNull null
            }
            val separator = trimmed.indexOf("=")
            val candidateKey = trimmed.substring(0, separator).trim()
            if (candidateKey != key) {
                return@firstNotNullOfOrNull null
            }
            trimmed.substring(separator + 1)
                .trim()
                .removeSurrounding("\"")
                .removeSurrounding("'")
                .takeIf { it.isNotBlank() }
        }

    return fromGradleProperty ?: fromEnvironment ?: fromDotEnv ?: defaultValue
}

fun Project.resolveApiBaseUrl(defaultValue: String): String {
    val resolved = resolveConfigValue("API_BASE_URL", defaultValue).trim()
    return if (resolved.contains("desbravadores.dev", ignoreCase = true)) {
        logger.warn("API_BASE_URL points to deprecated host '$resolved'. Falling back to $defaultValue.")
        defaultValue
    } else {
        resolved
    }
}

fun Project.resolveApiBaseUrl(keys: List<String>, defaultValue: String): String {
    val resolved = keys.firstNotNullOfOrNull { key ->
        resolveConfigValue(key, "")
            .trim()
            .takeIf { it.isNotBlank() }
    } ?: defaultValue

    return if (resolved.contains("desbravadores.dev", ignoreCase = true)) {
        logger.warn("API base URL points to deprecated host '$resolved'. Falling back to $defaultValue.")
        defaultValue
    } else {
        resolved
    }
}

val debugApiBaseUrl = project.resolveApiBaseUrl(
    keys = listOf("API_BASE_URL_DEBUG", "API_BASE_URL"),
    defaultValue = "http://10.0.2.2:8080",
)
val releaseApiBaseUrl = project.resolveApiBaseUrl(
    keys = listOf("API_BASE_URL_RELEASE", "API_BASE_URL"),
    defaultValue = "https://pointfinder.pt",
)
val enableChunkedMediaUpload = project.resolveConfigValue("ENABLE_CHUNKED_MEDIA_UPLOAD", "true")
// Google Maps API key no longer needed (using MapLibre)
val hasGoogleServicesConfig = listOf(
    "google-services.json",
    "src/main/google-services.json",
    "src/debug/google-services.json",
    "src/release/google-services.json",
).any { project.file(it).exists() }

if (hasGoogleServicesConfig) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.lifecycle("google-services.json not found for ${project.path}; skipping Google Services plugin.")
}

android {
    namespace = "com.prayer.pointfinder"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.prayer.pointfinder"
        minSdk = 26
        targetSdk = 35
        versionCode = 13
        versionName = "0.9.3"
        buildConfigField("Boolean", "ENABLE_MOBILE_REALTIME", "true")
        buildConfigField("Boolean", "ENABLE_CHUNKED_MEDIA_UPLOAD", enableChunkedMediaUpload)

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
        // manifestPlaceholders removed — MapLibre does not need an API key
    }

    signingConfigs {
        create("release") {
            storeFile = file(resolveConfigValue("KEYSTORE_FILE", "app-key.jks"))
            storePassword = resolveConfigValue("KEYSTORE_PASSWORD", "")
            keyAlias = resolveConfigValue("KEY_ALIAS", "")
            keyPassword = resolveConfigValue("KEY_PASSWORD", "")
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"${debugApiBaseUrl.replace("\"", "\\\"")}\"")
        }

        release {
            buildConfigField("String", "API_BASE_URL", "\"${releaseApiBaseUrl.replace("\"", "\\\"")}\"")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = signingConfigs.getByName("release")
            ndk {
                debugSymbolLevel = "FULL"
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    val composeBom = platform(libs.androidx.compose.bom)

    implementation(project(":core:model"))
    implementation(project(":core:network"))
    implementation(project(":core:data"))
    implementation(project(":core:platform"))
    implementation(project(":core:i18n"))
    implementation(project(":feature:auth"))
    implementation(project(":feature:player"))
    implementation(project(":feature:operator"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.google.material)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    implementation(libs.maplibre)

    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.play.services.code.scanner)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging.ktx)

    implementation(libs.androidx.room.runtime)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.androidx.security.crypto)
    implementation(libs.sqlcipher)
    implementation(libs.androidx.sqlite)

    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)
    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
