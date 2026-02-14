plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
    id("com.google.gms.google-services") apply false
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

val apiBaseUrl = project.resolveConfigValue("API_BASE_URL", "https://desbravadores.dev")
val mapsApiKey = project.resolveConfigValue("GOOGLE_MAPS_API_KEY", "")
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
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_BASE_URL", "\"${apiBaseUrl.replace("\"", "\\\"")}\"")
        buildConfigField("Boolean", "ENABLE_MOBILE_REALTIME", "true")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
        manifestPlaceholders["mapsApiKey"] = mapsApiKey
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
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
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")

    implementation(project(":core:model"))
    implementation(project(":core:network"))
    implementation(project(":core:data"))
    implementation(project(":core:platform"))
    implementation(project(":core:i18n"))
    implementation(project(":feature:auth"))
    implementation(project(":feature:player"))
    implementation(project(":feature:operator"))

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.3")

    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("com.google.android.material:material:1.12.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    implementation("com.google.maps.android:maps-compose:6.3.0")
    implementation("com.google.android.gms:play-services-maps:19.0.0")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")

    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")

    implementation("androidx.room:room-runtime:2.6.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("net.zetetic:android-database-sqlcipher:4.5.4")
    implementation("androidx.sqlite:sqlite:2.4.0")

    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
    implementation("androidx.hilt:hilt-work:1.2.0")
    ksp("androidx.hilt:hilt-compiler:1.2.0")
    implementation("com.google.dagger:hilt-android:2.52")
    ksp("com.google.dagger:hilt-android-compiler:2.52")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}