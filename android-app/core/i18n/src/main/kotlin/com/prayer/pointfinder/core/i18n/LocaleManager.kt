package com.prayer.pointfinder.core.i18n

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

object LocaleManager {
    val supportedLanguages = listOf("en", "pt", "de")

    fun normalizeLanguage(deviceLanguage: String?): String {
        val code = deviceLanguage?.lowercase()?.take(2) ?: "en"
        return if (supportedLanguages.contains(code)) code else "en"
    }

    fun applyLanguage(languageCode: String) {
        val normalized = normalizeLanguage(languageCode)
        AppCompatDelegate.setApplicationLocales(
            LocaleListCompat.forLanguageTags(normalized),
        )
    }
}
