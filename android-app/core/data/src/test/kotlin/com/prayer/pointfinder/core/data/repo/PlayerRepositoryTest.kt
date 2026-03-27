package com.prayer.pointfinder.core.data.repo

import android.content.Context
import com.prayer.pointfinder.core.data.local.CachedChallengeEntity
import com.prayer.pointfinder.core.data.local.CachedProgressEntity
import com.prayer.pointfinder.core.data.local.ChallengeDao
import com.prayer.pointfinder.core.data.local.CompanionDatabase
import com.prayer.pointfinder.core.data.local.PendingActionDao
import com.prayer.pointfinder.core.data.local.PendingActionEntity
import com.prayer.pointfinder.core.data.local.ProgressDao
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.GameDataResponse
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.PlayerSubmissionRequest
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.SubmissionStatus
import com.prayer.pointfinder.core.network.CompanionApi
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException

class PlayerRepositoryTest {

    private lateinit var api: CompanionApi
    private lateinit var db: CompanionDatabase
    private lateinit var context: Context
    private lateinit var pendingActionDao: PendingActionDao
    private lateinit var progressDao: ProgressDao
    private lateinit var challengeDao: ChallengeDao
    private lateinit var repo: PlayerRepository

    private val playerAuth = AuthType.Player(
        token = "test-token",
        playerId = "player-1",
        teamId = "team-1",
        gameId = "game-1",
        displayName = "Test Player",
    )

    @Before
    fun setup() {
        api = mockk(relaxed = true)
        db = mockk(relaxed = true)
        context = mockk(relaxed = true)
        pendingActionDao = mockk(relaxed = true)
        progressDao = mockk(relaxed = true)
        challengeDao = mockk(relaxed = true)

        every { db.pendingActionDao() } returns pendingActionDao
        every { db.progressDao() } returns progressDao
        every { db.challengeDao() } returns challengeDao

        repo = PlayerRepository(api, db, context)
    }

    // --- loadProgress ---

    @Test
    fun `loadProgress online calls API with correct gameId`() = runTest {
        val gameData = GameDataResponse(
            gameStatus = GameStatus.LIVE,
            bases = emptyList(),
            challenges = emptyList(),
            assignments = emptyList(),
            progress = listOf(
                BaseProgress(
                    baseId = "base-1",
                    baseName = "Start",
                    lat = 47.0,
                    lng = 8.0,
                    nfcLinked = true,
                    status = BaseStatus.NOT_VISITED,
                ),
            ),
        )
        coEvery { api.getGameData("game-1") } returns gameData

        val result = repo.loadProgress(playerAuth, online = true)

        coVerify { api.getGameData("game-1") }
        assertEquals(GameStatus.LIVE, result.gameStatus)
        assertEquals(1, result.progress.size)
        assertEquals("base-1", result.progress[0].baseId)
    }

    @Test
    fun `loadProgress online caches progress to local database`() = runTest {
        val gameData = GameDataResponse(
            gameStatus = GameStatus.LIVE,
            bases = emptyList(),
            challenges = emptyList(),
            assignments = emptyList(),
            progress = listOf(
                BaseProgress(
                    baseId = "base-1",
                    baseName = "Start",
                    lat = 47.0,
                    lng = 8.0,
                    nfcLinked = true,
                    status = BaseStatus.NOT_VISITED,
                ),
            ),
        )
        coEvery { api.getGameData("game-1") } returns gameData

        repo.loadProgress(playerAuth, online = true)

        coVerify { progressDao.deleteForGame("game-1") }
        coVerify { progressDao.upsertAll(any()) }
    }

    @Test
    fun `loadProgress offline falls back to cached database`() = runTest {
        val cached = listOf(
            CachedProgressEntity(
                gameId = "game-1",
                baseId = "base-1",
                baseName = "Cached Base",
                lat = 47.0,
                lng = 8.0,
                nfcLinked = true,
                status = "not_visited",
                checkedInAt = null,
                challengeId = null,
                submissionStatus = null,
            ),
        )
        coEvery { progressDao.progressForGame("game-1") } returns cached

        val result = repo.loadProgress(playerAuth, online = false)

        coVerify(exactly = 0) { api.getGameData(any()) }
        assertEquals(1, result.progress.size)
        assertEquals("Cached Base", result.progress[0].baseName)
    }

    @Test
    fun `loadProgress falls back to offline when API throws IOException`() = runTest {
        coEvery { api.getGameData("game-1") } throws IOException("No network")
        val cached = listOf(
            CachedProgressEntity(
                gameId = "game-1",
                baseId = "base-1",
                baseName = "Offline Base",
                lat = 47.0,
                lng = 8.0,
                nfcLinked = true,
                status = "not_visited",
                checkedInAt = null,
                challengeId = null,
                submissionStatus = null,
            ),
        )
        coEvery { progressDao.progressForGame("game-1") } returns cached

        val result = repo.loadProgress(playerAuth, online = true)

        assertEquals(1, result.progress.size)
        assertEquals("Offline Base", result.progress[0].baseName)
        // Uses auth gameStatus as fallback when API fails
        assertEquals(playerAuth.gameStatus, result.gameStatus)
    }

    // --- checkIn ---

    @Test
    fun `checkIn online calls correct API endpoint`() = runTest {
        val checkInResponse = CheckInResponse(
            checkInId = "ci-1",
            baseId = "base-1",
            baseName = "HQ",
            checkedInAt = "2026-03-20T10:00:00Z",
            challenge = null,
        )
        coEvery { api.checkIn("game-1", "base-1", any()) } returns checkInResponse

        val result = repo.checkIn(playerAuth, "base-1", nfcToken = null, online = true)

        coVerify { api.checkIn("game-1", "base-1", any()) }
        assertFalse(result.queued)
        assertEquals("ci-1", result.response.checkInId)
    }

    @Test
    fun `checkIn online updates local progress status`() = runTest {
        val checkInResponse = CheckInResponse(
            checkInId = "ci-1",
            baseId = "base-1",
            baseName = "HQ",
            checkedInAt = "2026-03-20T10:00:00Z",
            challenge = null,
        )
        coEvery { api.checkIn("game-1", "base-1", any()) } returns checkInResponse

        repo.checkIn(playerAuth, "base-1", nfcToken = null, online = true)

        coVerify { progressDao.updateStatus("game-1", "base-1", "checked_in") }
    }

    @Test
    fun `checkIn offline queues pending action`() = runTest {
        coEvery { pendingActionDao.hasPendingCheckIn("game-1", "base-1") } returns false
        val cached = listOf(
            CachedProgressEntity(
                gameId = "game-1",
                baseId = "base-1",
                baseName = "Offline Base",
                lat = 47.0,
                lng = 8.0,
                nfcLinked = true,
                status = "not_visited",
                checkedInAt = null,
                challengeId = null,
                submissionStatus = null,
            ),
        )
        coEvery { progressDao.progressForGame("game-1") } returns cached

        val result = repo.checkIn(playerAuth, "base-1", nfcToken = null, online = false)

        assertTrue(result.queued)
        val slot = slot<PendingActionEntity>()
        coVerify { pendingActionDao.upsert(capture(slot)) }
        assertEquals("check_in", slot.captured.type)
        assertEquals("game-1", slot.captured.gameId)
        assertEquals("base-1", slot.captured.baseId)
    }

    @Test
    fun `checkIn offline does not duplicate if already queued`() = runTest {
        coEvery { pendingActionDao.hasPendingCheckIn("game-1", "base-1") } returns true
        coEvery { progressDao.progressForGame("game-1") } returns emptyList()

        val result = repo.checkIn(playerAuth, "base-1", nfcToken = null, online = false)

        assertTrue(result.queued)
        coVerify(exactly = 0) { pendingActionDao.upsert(any()) }
    }

    @Test
    fun `checkIn falls back to queue when API throws IOException`() = runTest {
        coEvery { api.checkIn("game-1", "base-1", any()) } throws IOException("timeout")
        coEvery { pendingActionDao.hasPendingCheckIn("game-1", "base-1") } returns false
        coEvery { progressDao.progressForGame("game-1") } returns emptyList()

        val result = repo.checkIn(playerAuth, "base-1", nfcToken = null, online = true)

        assertTrue(result.queued)
        coVerify { pendingActionDao.upsert(any()) }
    }

    // --- submitText ---

    @Test
    fun `submitText online calls API with correct request`() = runTest {
        val submissionResponse = SubmissionResponse(
            id = "sub-1",
            teamId = "team-1",
            challengeId = "challenge-1",
            baseId = "base-1",
            answer = "42",
            status = SubmissionStatus.PENDING,
            submittedAt = "2026-03-20T10:00:00Z",
        )
        coEvery { api.submitAnswer("game-1", any()) } returns submissionResponse

        val result = repo.submitText(playerAuth, "base-1", "challenge-1", "42", online = true)

        assertFalse(result.queued)
        assertEquals("sub-1", result.response.id)
        assertEquals(SubmissionStatus.PENDING, result.response.status)

        val requestSlot = slot<PlayerSubmissionRequest>()
        coVerify { api.submitAnswer("game-1", capture(requestSlot)) }
        assertEquals("base-1", requestSlot.captured.baseId)
        assertEquals("challenge-1", requestSlot.captured.challengeId)
        assertEquals("42", requestSlot.captured.answer)
    }

    @Test
    fun `submitText online updates progress status`() = runTest {
        val submissionResponse = SubmissionResponse(
            id = "sub-1",
            teamId = "team-1",
            challengeId = "challenge-1",
            baseId = "base-1",
            answer = "42",
            status = SubmissionStatus.PENDING,
            submittedAt = "2026-03-20T10:00:00Z",
        )
        coEvery { api.submitAnswer("game-1", any()) } returns submissionResponse

        repo.submitText(playerAuth, "base-1", "challenge-1", "42", online = true)

        coVerify { progressDao.updateStatus("game-1", "base-1", "submitted") }
        coVerify { progressDao.updateSubmissionStatus("game-1", "base-1", "pending") }
    }

    @Test
    fun `submitText offline queues action with correct fields`() = runTest {
        val result = repo.submitText(playerAuth, "base-1", "challenge-1", "answer text", online = false)

        assertTrue(result.queued)
        assertEquals(SubmissionStatus.PENDING, result.response.status)
        assertEquals("answer text", result.response.answer)

        val slot = slot<PendingActionEntity>()
        coVerify { pendingActionDao.upsert(capture(slot)) }
        assertEquals("submission", slot.captured.type)
        assertEquals("game-1", slot.captured.gameId)
        assertEquals("base-1", slot.captured.baseId)
        assertEquals("challenge-1", slot.captured.challengeId)
        assertEquals("answer text", slot.captured.answer)
    }

    @Test
    fun `submitText falls back to queue when API throws IOException`() = runTest {
        coEvery { api.submitAnswer("game-1", any()) } throws IOException("network error")

        val result = repo.submitText(playerAuth, "base-1", "challenge-1", "my answer", online = true)

        assertTrue(result.queued)
        coVerify { pendingActionDao.upsert(any()) }
    }

    // --- pendingCount ---

    @Test
    fun `pendingCount delegates to DAO`() = runTest {
        coEvery { pendingActionDao.pendingCount() } returns 5

        val count = repo.pendingCount()

        assertEquals(5, count)
        coVerify { pendingActionDao.pendingCount() }
    }

    // --- clearAll ---

    @Test
    fun `clearAll clears all DAOs`() = runTest {
        repo.clearAll()

        coVerify { pendingActionDao.clearAll() }
        coVerify { progressDao.clearAll() }
        coVerify { challengeDao.clearAll() }
    }

    // --- checkIn online caches challenge from response ---

    @Test
    fun `checkIn online caches challenge when returned in response`() = runTest {
        val challenge = CheckInResponse.ChallengeInfo(
            id = "ch-1",
            title = "Find the flag",
            description = "Search for hidden flag",
            content = "Look near the big tree",
            answerType = "text",
            points = 10,
        )
        val checkInResponse = CheckInResponse(
            checkInId = "ci-1",
            baseId = "base-1",
            baseName = "HQ",
            checkedInAt = "2026-03-20T10:00:00Z",
            challenge = challenge,
        )
        coEvery { api.checkIn("game-1", "base-1", any()) } returns checkInResponse

        repo.checkIn(playerAuth, "base-1", nfcToken = null, online = true)

        val slot = slot<CachedChallengeEntity>()
        coVerify { challengeDao.upsert(capture(slot)) }
        assertEquals("ch-1", slot.captured.id)
        assertEquals("Find the flag", slot.captured.title)
        assertEquals("game-1", slot.captured.gameId)
        assertEquals("team-1", slot.captured.teamId)
        assertEquals("base-1", slot.captured.baseId)
    }
}
