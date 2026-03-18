package com.prayer.pointfinder.core.model.contract

import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.Game
import com.prayer.pointfinder.core.model.LeaderboardEntry
import com.prayer.pointfinder.core.model.OperatorAuthResponse
import com.prayer.pointfinder.core.model.PlayerAuthResponse
import com.prayer.pointfinder.core.model.SubmissionResponse
import com.prayer.pointfinder.core.model.SubmissionStatus
import com.prayer.pointfinder.core.model.UserResponse
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.io.File

/**
 * Cross-platform DTO contract tests for Android.
 *
 * Reads canonical JSON snapshots from contract-snapshots/ at the repo root
 * and validates that kotlinx.serialization can deserialize them correctly.
 * This catches DTO drift between backend and Android.
 */
class DtoContractTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun readSnapshot(name: String): String {
        // Navigate from module root to repo root: core/model -> android-app -> repo root
        val repoRoot = File(System.getProperty("user.dir")!!).resolve("../../..")
        val snapshotFile = repoRoot.resolve("contract-snapshots/$name.json")
        require(snapshotFile.exists()) {
            "Snapshot file not found: ${snapshotFile.absolutePath}. " +
                "Run the backend DtoContractTest first to generate snapshots."
        }
        return snapshotFile.readText()
    }

    @Test
    fun `AuthResponse deserializes from contract snapshot`() {
        val snapshot = readSnapshot("AuthResponse")
        val dto = json.decodeFromString<OperatorAuthResponse>(snapshot)

        assertEquals("eyJhbGciOiJIUzI1NiJ9.test-access-token", dto.accessToken)
        assertEquals("eyJhbGciOiJIUzI1NiJ9.test-refresh-token", dto.refreshToken)
        assertNotNull(dto.user)
        assertEquals("a1b2c3d4-e5f6-7890-abcd-ef1234567890", dto.user.id)
        assertEquals("operator@example.com", dto.user.email)
        assertEquals("Test Operator", dto.user.name)
        assertEquals("operator", dto.user.role)
    }

    @Test
    fun `PlayerAuthResponse deserializes from contract snapshot`() {
        val snapshot = readSnapshot("PlayerAuthResponse")
        val dto = json.decodeFromString<PlayerAuthResponse>(snapshot)

        assertEquals("eyJhbGciOiJIUzI1NiJ9.test-player-token", dto.token)
        assertNotNull(dto.player)
        assertEquals("b2c3d4e5-f6a7-8901-bcde-f12345678901", dto.player.id)
        assertEquals("Scout Team Alpha", dto.player.displayName)
        assertEquals("ios-device-abc123", dto.player.deviceId)
        assertNotNull(dto.team)
        assertEquals("c3d4e5f6-a7b8-9012-cdef-123456789012", dto.team.id)
        assertEquals("Eagles", dto.team.name)
        assertEquals("#FF5733", dto.team.color)
        assertNotNull(dto.game)
        assertEquals("d4e5f6a7-b8c9-0123-defa-234567890123", dto.game.id)
        assertEquals("Forest Adventure", dto.game.name)
        assertEquals("A scouting game in the forest", dto.game.description)
        assertEquals("osm-classic", dto.game.tileSource)
    }

    @Test
    fun `GameResponse deserializes from contract snapshot`() {
        val snapshot = readSnapshot("GameResponse")
        val dto = json.decodeFromString<Game>(snapshot)

        assertEquals("d4e5f6a7-b8c9-0123-defa-234567890123", dto.id)
        assertEquals("Forest Adventure", dto.name)
        assertEquals("A scouting game in the forest", dto.description)
        assertEquals("live", dto.status.name.lowercase())
        assertEquals("osm-classic", dto.tileSource)
        assertEquals(false, dto.uniformAssignment)
        assertEquals(true, dto.broadcastEnabled)
        assertEquals("FOREST2025", dto.broadcastCode)
        assertNotNull(dto.operatorIds)
        assertEquals(1, dto.operatorIds!!.size)
    }

    @Test
    fun `SubmissionResponse deserializes from contract snapshot`() {
        val snapshot = readSnapshot("SubmissionResponse")
        val dto = json.decodeFromString<SubmissionResponse>(snapshot)

        assertEquals("e5f6a7b8-c9d0-1234-efab-345678901234", dto.id)
        assertEquals("c3d4e5f6-a7b8-9012-cdef-123456789012", dto.teamId)
        assertEquals("f6a7b8c9-d0e1-2345-fabc-456789012345", dto.challengeId)
        assertEquals("a7b8c9d0-e1f2-3456-abcd-567890123456", dto.baseId)
        assertEquals("The answer is 42", dto.answer)
        assertEquals("/uploads/game1/photo.jpg", dto.fileUrl)
        assertNotNull(dto.fileUrls)
        assertEquals(2, dto.fileUrls!!.size)
        assertEquals(SubmissionStatus.APPROVED, dto.status)
        assertEquals("2025-03-01T10:30:00Z", dto.submittedAt)
        assertEquals("a1b2c3d4-e5f6-7890-abcd-ef1234567890", dto.reviewedBy)
        assertEquals("Great work!", dto.feedback)
        assertEquals(100, dto.points)
        assertEquals("You found the hidden treasure!", dto.completionContent)
    }

    @Test
    fun `BaseProgressResponse deserializes from contract snapshot`() {
        val snapshot = readSnapshot("BaseProgressResponse")
        val dto = json.decodeFromString<BaseProgress>(snapshot)

        assertEquals("a7b8c9d0-e1f2-3456-abcd-567890123456", dto.baseId)
        assertEquals("Forest Clearing", dto.baseName)
        assertEquals(47.3769, dto.lat, 0.0001)
        assertEquals(8.5417, dto.lng, 0.0001)
        assertEquals(true, dto.nfcLinked)
        assertEquals(BaseStatus.COMPLETED, dto.status)
        assertEquals("2025-03-01T09:15:00Z", dto.checkedInAt)
        assertEquals("f6a7b8c9-d0e1-2345-fabc-456789012345", dto.challengeId)
        assertEquals("approved", dto.submissionStatus)
    }

    @Test
    fun `LeaderboardEntry deserializes from contract snapshot`() {
        val snapshot = readSnapshot("LeaderboardEntry")
        val dto = json.decodeFromString<LeaderboardEntry>(snapshot)

        assertEquals("c3d4e5f6-a7b8-9012-cdef-123456789012", dto.teamId)
        assertEquals("Eagles", dto.teamName)
        assertEquals("#FF5733", dto.color)
        assertEquals(350, dto.points)
        assertEquals(5, dto.completedChallenges)
    }
}
