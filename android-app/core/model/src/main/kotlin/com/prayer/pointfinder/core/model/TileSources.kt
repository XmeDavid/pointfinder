package com.prayer.pointfinder.core.model

object TileSources {
    private val STYLES = mapOf(
        "osm" to "https://tiles.openfreemap.org/styles/liberty",
        "osm-classic" to "https://pointfinder.pt/styles/osm-classic.json",
        "swisstopo" to "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
        "swisstopo-sat" to "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json",
        "voyager" to "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        "positron" to "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    )

    const val DARK_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

    private val DARK_STYLES = mapOf(
        "osm" to DARK_STYLE_URL,
        "voyager" to DARK_STYLE_URL,
        "positron" to DARK_STYLE_URL,
    )

    fun getStyleUrl(key: String?): String =
        STYLES[key] ?: STYLES["osm"]!!

    fun getResolvedStyleUrl(key: String?, isDark: Boolean): String {
        if (isDark) {
            val darkUrl = DARK_STYLES[key ?: "osm"]
            if (darkUrl != null) return darkUrl
        }
        return getStyleUrl(key)
    }
}
