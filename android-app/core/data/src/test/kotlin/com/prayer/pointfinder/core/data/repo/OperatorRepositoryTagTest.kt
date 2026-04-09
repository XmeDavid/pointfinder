package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.model.CreateTagRequest
import com.prayer.pointfinder.core.model.GameTag
import com.prayer.pointfinder.core.model.UpdateTagRequest
import com.prayer.pointfinder.core.network.CompanionApi
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class OperatorRepositoryTagTest {

    private lateinit var api: CompanionApi
    private lateinit var repo: OperatorRepository

    private val gameId = "game-1"
    private val tagId = "tag-1"

    private val sampleTag = GameTag(
        id = tagId,
        gameId = gameId,
        label = "Red",
        color = "#EF4444",
        createdAt = "2026-01-01T00:00:00Z",
        updatedAt = "2026-01-01T00:00:00Z",
    )

    @Before
    fun setup() {
        api = mockk(relaxed = true)
        repo = OperatorRepository(api)
    }

    @Test
    fun `listTags delegates to api and returns result`() = runTest {
        val expected = listOf(sampleTag)
        coEvery { api.listTags(gameId) } returns expected

        val result = repo.listTags(gameId)

        assertEquals(expected, result)
        coVerify(exactly = 1) { api.listTags(gameId) }
    }

    @Test
    fun `createTag sends request and returns created tag`() = runTest {
        val request = CreateTagRequest(label = "Red", color = "#EF4444")
        coEvery { api.createTag(gameId, request) } returns sampleTag

        val result = repo.createTag(gameId, request)

        assertEquals(sampleTag, result)
        coVerify(exactly = 1) { api.createTag(gameId, request) }
    }

    @Test
    fun `updateTag sends patch and returns updated tag`() = runTest {
        val request = UpdateTagRequest(label = "Blue")
        val updated = sampleTag.copy(label = "Blue", color = "#3B82F6")
        coEvery { api.updateTag(gameId, tagId, request) } returns updated

        val result = repo.updateTag(gameId, tagId, request)

        assertEquals(updated, result)
        coVerify(exactly = 1) { api.updateTag(gameId, tagId, request) }
    }

    @Test
    fun `deleteTag calls api with correct ids on success`() = runTest {
        coEvery { api.deleteTag(gameId, tagId) } returns Response.success(Unit)

        repo.deleteTag(gameId, tagId)

        coVerify(exactly = 1) { api.deleteTag(gameId, tagId) }
    }

    @Test(expected = Exception::class)
    fun `deleteTag throws on non-success response`() = runTest {
        coEvery { api.deleteTag(gameId, tagId) } returns
            Response.error(409, """{"code":"TAG_IN_USE"}""".toResponseBody())

        repo.deleteTag(gameId, tagId)
    }
}
