package com.prayer.pointfinder.core.model

object TileSources {
    private val STYLES = mapOf(
        "osm" to "https://tiles.openfreemap.org/styles/liberty",
        "swisstopo" to "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
        "swisstopo-sat" to "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json",
    )

    const val DARK_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"

    fun getStyleUrl(key: String?): String =
        STYLES[key] ?: STYLES["osm"]!!
}
