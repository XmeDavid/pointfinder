package com.prayer.pointfinder.feature.operator

import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DropdownFilteringTest {

    // -- Test helpers --

    private fun base(
        id: String,
        hidden: Boolean = false,
        fixedChallengeId: String? = null,
    ) = Base(
        id = id,
        name = "Base $id",
        description = "",
        lat = 0.0,
        lng = 0.0,
        nfcLinked = false,
        requirePresenceToSubmit = false,
        hidden = hidden,
        fixedChallengeId = fixedChallengeId,
    )

    private fun challenge(
        id: String,
        unlocksBaseId: String? = null,
    ) = Challenge(
        id = id,
        title = "Challenge $id",
        description = "",
        content = "",
        answerType = "text",
        points = 10,
        unlocksBaseId = unlocksBaseId,
    )

    // -- filterAvailableChallenges tests --

    @Test
    fun `filterAvailableChallenges excludes challenges fixed to other bases`() {
        val challenges = listOf(challenge("c1"), challenge("c2"), challenge("c3"))
        val bases = listOf(
            base("b1", fixedChallengeId = "c1"),
            base("b2"),
        )
        val result = filterAvailableChallenges(challenges, bases, editingBaseId = "b2", currentFixedChallengeId = null)
        assertEquals(listOf("c2", "c3"), result.map { it.id })
    }

    @Test
    fun `filterAvailableChallenges keeps currently selected challenge`() {
        val challenges = listOf(challenge("c1"), challenge("c2"))
        val bases = listOf(
            base("b1", fixedChallengeId = "c1"),
            base("b2", fixedChallengeId = "c1"),
        )
        // Editing b2 which currently has c1 selected — c1 should remain available
        val result = filterAvailableChallenges(challenges, bases, editingBaseId = "b2", currentFixedChallengeId = "c1")
        assertEquals(listOf("c1", "c2"), result.map { it.id })
    }

    @Test
    fun `filterAvailableChallenges excludes own base from unavailable set`() {
        val challenges = listOf(challenge("c1"), challenge("c2"))
        val bases = listOf(
            base("b1", fixedChallengeId = "c1"),
        )
        // Editing b1 which has c1 — c1 is on OUR base so it should be available
        val result = filterAvailableChallenges(challenges, bases, editingBaseId = "b1", currentFixedChallengeId = "c1")
        assertEquals(listOf("c1", "c2"), result.map { it.id })
    }

    @Test
    fun `filterAvailableChallenges returns all when no bases have fixed challenges`() {
        val challenges = listOf(challenge("c1"), challenge("c2"), challenge("c3"))
        val bases = listOf(base("b1"), base("b2"))
        val result = filterAvailableChallenges(challenges, bases, editingBaseId = null, currentFixedChallengeId = null)
        assertEquals(3, result.size)
    }

    // -- filterAvailableBases tests --

    @Test
    fun `filterAvailableBases excludes bases with existing fixedChallengeId`() {
        val bases = listOf(
            base("b1", fixedChallengeId = "c1"),
            base("b2"),
            base("b3", fixedChallengeId = "c2"),
        )
        val result = filterAvailableBases(bases, editingChallengeId = null)
        assertEquals(listOf("b2"), result.map { it.id })
    }

    @Test
    fun `filterAvailableBases keeps base matching current challenge`() {
        val bases = listOf(
            base("b1", fixedChallengeId = "c1"),
            base("b2", fixedChallengeId = "c2"),
        )
        val result = filterAvailableBases(bases, editingChallengeId = "c1")
        assertEquals(listOf("b1"), result.map { it.id })
    }

    @Test
    fun `filterAvailableBases returns all when no bases have fixed challenges`() {
        val bases = listOf(base("b1"), base("b2"))
        val result = filterAvailableBases(bases, editingChallengeId = null)
        assertEquals(2, result.size)
    }

    // -- filterAvailableUnlockBases tests --

    @Test
    fun `filterAvailableUnlockBases only shows hidden bases`() {
        val bases = listOf(
            base("b1", hidden = false),
            base("b2", hidden = true),
            base("b3", hidden = true),
        )
        val result = filterAvailableUnlockBases(bases, emptyList(), editingChallengeId = null, fixedBaseId = null)
        assertEquals(listOf("b2", "b3"), result.map { it.id })
    }

    @Test
    fun `filterAvailableUnlockBases excludes own fixedBaseId`() {
        val bases = listOf(
            base("b1", hidden = true),
            base("b2", hidden = true),
        )
        val result = filterAvailableUnlockBases(bases, emptyList(), editingChallengeId = null, fixedBaseId = "b1")
        assertEquals(listOf("b2"), result.map { it.id })
    }

    @Test
    fun `filterAvailableUnlockBases excludes bases already unlocked by other challenges`() {
        val bases = listOf(
            base("b1", hidden = true),
            base("b2", hidden = true),
            base("b3", hidden = true),
        )
        val challenges = listOf(
            challenge("c1", unlocksBaseId = "b1"),
            challenge("c2", unlocksBaseId = "b2"),
        )
        val result = filterAvailableUnlockBases(bases, challenges, editingChallengeId = null, fixedBaseId = null)
        assertEquals(listOf("b3"), result.map { it.id })
    }

    @Test
    fun `filterAvailableUnlockBases keeps base unlocked by current challenge`() {
        val bases = listOf(
            base("b1", hidden = true),
            base("b2", hidden = true),
        )
        val challenges = listOf(
            challenge("c1", unlocksBaseId = "b1"),
            challenge("c2", unlocksBaseId = "b2"),
        )
        // Editing c1 — b1 is unlocked by c1 itself, so it should remain available
        val result = filterAvailableUnlockBases(bases, challenges, editingChallengeId = "c1", fixedBaseId = null)
        assertEquals(listOf("b1"), result.map { it.id })
    }

    @Test
    fun `filterAvailableUnlockBases returns empty when no hidden bases exist`() {
        val bases = listOf(base("b1"), base("b2"))
        val result = filterAvailableUnlockBases(bases, emptyList(), editingChallengeId = null, fixedBaseId = null)
        assertTrue(result.isEmpty())
    }
}
