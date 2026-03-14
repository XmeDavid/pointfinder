package com.prayer.pointfinder.core.model

import org.junit.Assert.assertEquals
import org.junit.Test

class BaseProgressTest {
    @Test
    fun `status field holds correct enum value`() {
        val progress = BaseProgress(
            baseId = "base",
            baseName = "Base",
            lat = 0.0,
            lng = 0.0,
            nfcLinked = false,
            status = BaseStatus.COMPLETED,
        )
        assertEquals(BaseStatus.COMPLETED, progress.status)
    }

    @Test
    fun `enum ordinal order matches priority`() {
        val expected = listOf(
            BaseStatus.NOT_VISITED,
            BaseStatus.CHECKED_IN,
            BaseStatus.SUBMITTED,
            BaseStatus.COMPLETED,
            BaseStatus.REJECTED,
        )
        assertEquals(expected, BaseStatus.entries.toList())
    }
}
