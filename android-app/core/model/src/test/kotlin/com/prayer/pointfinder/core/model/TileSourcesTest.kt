package com.prayer.pointfinder.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TileSourcesTest {

    private val expectedKeys = listOf(
        "osm",
        "osm-classic",
        "voyager",
        "positron",
        "swisstopo",
        "swisstopo-sat",
    )

    @Test
    fun `getStyleUrl returns a URL for all expected keys`() {
        for (key in expectedKeys) {
            val url = TileSources.getStyleUrl(key)
            assertTrue("Style URL for '$key' should start with https://", url.startsWith("https://"))
        }
    }

    @Test
    fun `getStyleUrl falls back for null key`() {
        val url = TileSources.getStyleUrl(null)
        assertNotNull(url)
        assertTrue(url.startsWith("https://"))
    }

    @Test
    fun `getStyleUrl falls back for unknown key`() {
        val url = TileSources.getStyleUrl("unknown")
        assertEquals(TileSources.getStyleUrl("osm-classic"), url)
    }

    @Test
    fun `getResolvedStyleUrl returns dark style when available`() {
        val url = TileSources.getResolvedStyleUrl("osm", isDark = true)
        assertTrue(url.contains("dark-matter"))
    }

    @Test
    fun `getResolvedStyleUrl returns normal style when no dark variant`() {
        val url = TileSources.getResolvedStyleUrl("swisstopo", isDark = true)
        assertTrue("SwissTopo has no dark style, should return normal", !url.contains("dark-matter"))
    }

    @Test
    fun `getResolvedStyleUrl returns normal style when isDark is false`() {
        val url = TileSources.getResolvedStyleUrl("osm", isDark = false)
        assertTrue(!url.contains("dark-matter"))
    }
}
