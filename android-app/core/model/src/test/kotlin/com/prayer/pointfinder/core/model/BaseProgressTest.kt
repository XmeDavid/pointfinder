package com.prayer.pointfinder.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class BaseStatusColorTest {

    // colorFor()

    @Test
    fun `colorFor NOT_VISITED returns gray`() {
        assertEquals(BaseStatus.COLOR_NOT_VISITED, BaseStatus.colorFor(BaseStatus.NOT_VISITED))
    }

    @Test
    fun `colorFor CHECKED_IN returns blue`() {
        assertEquals(BaseStatus.COLOR_CHECKED_IN, BaseStatus.colorFor(BaseStatus.CHECKED_IN))
    }

    @Test
    fun `colorFor SUBMITTED returns orange`() {
        assertEquals(BaseStatus.COLOR_SUBMITTED, BaseStatus.colorFor(BaseStatus.SUBMITTED))
    }

    @Test
    fun `colorFor COMPLETED returns green`() {
        assertEquals(BaseStatus.COLOR_COMPLETED, BaseStatus.colorFor(BaseStatus.COMPLETED))
    }

    @Test
    fun `colorFor REJECTED returns red`() {
        assertEquals(BaseStatus.COLOR_REJECTED, BaseStatus.colorFor(BaseStatus.REJECTED))
    }

    @Test
    fun `every BaseStatus value maps to a distinct color`() {
        val colors = BaseStatus.entries.map { BaseStatus.colorFor(it) }
        assertEquals("expected all colors to be distinct", colors.size, colors.toSet().size)
    }

    // colorForRawStatus()

    @Test
    fun `colorForRawStatus completed matches colorFor COMPLETED`() {
        assertEquals(
            BaseStatus.colorFor(BaseStatus.COMPLETED),
            BaseStatus.colorForRawStatus("completed"),
        )
    }

    @Test
    fun `colorForRawStatus checked_in matches colorFor CHECKED_IN`() {
        assertEquals(
            BaseStatus.colorFor(BaseStatus.CHECKED_IN),
            BaseStatus.colorForRawStatus("checked_in"),
        )
    }

    @Test
    fun `colorForRawStatus submitted matches colorFor SUBMITTED`() {
        assertEquals(
            BaseStatus.colorFor(BaseStatus.SUBMITTED),
            BaseStatus.colorForRawStatus("submitted"),
        )
    }

    @Test
    fun `colorForRawStatus rejected matches colorFor REJECTED`() {
        assertEquals(
            BaseStatus.colorFor(BaseStatus.REJECTED),
            BaseStatus.colorForRawStatus("rejected"),
        )
    }

    @Test
    fun `colorForRawStatus unknown string falls back to NOT_VISITED gray`() {
        assertEquals(
            BaseStatus.COLOR_NOT_VISITED,
            BaseStatus.colorForRawStatus("some_unknown_status"),
        )
    }

    @Test
    fun `colorForRawStatus empty string falls back to NOT_VISITED gray`() {
        assertEquals(BaseStatus.COLOR_NOT_VISITED, BaseStatus.colorForRawStatus(""))
    }

    @Test
    fun `colorForRawStatus is case-sensitive and treats uppercase as unknown`() {
        // Backend always sends lowercase; uppercase must not silently match
        val upperCaseResult = BaseStatus.colorForRawStatus("COMPLETED")
        assertNotEquals(BaseStatus.COLOR_COMPLETED, upperCaseResult)
        assertEquals(BaseStatus.COLOR_NOT_VISITED, upperCaseResult)
    }
}
