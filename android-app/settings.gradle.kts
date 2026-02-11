pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "dbv-android-companion"

include(
    ":app",
    ":core:model",
    ":core:network",
    ":core:data",
    ":core:platform",
    ":core:i18n",
    ":feature:auth",
    ":feature:player",
    ":feature:operator",
    ":testing",
)
