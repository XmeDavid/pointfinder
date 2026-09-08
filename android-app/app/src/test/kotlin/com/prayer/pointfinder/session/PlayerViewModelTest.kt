package com.prayer.pointfinder.session

import android.content.Context
import android.util.Log
import com.prayer.pointfinder.core.data.repo.PlayerRepository
import com.prayer.pointfinder.core.data.repo.ProgressResult
import com.prayer.pointfinder.core.data.repo.SessionStore
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.network.CompanionApi
import com.prayer.pointfinder.core.network.MobileRealtimeClient
import com.prayer.pointfinder.core.network.RealtimeConnectionState
import com.prayer.pointfinder.core.platform.NfcEventBus
import com.prayer.pointfinder.core.platform.PlayerLocationService
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PlayerViewModelTest {

    private lateinit var playerRepository: PlayerRepository
    private lateinit var nfcEventBus: NfcEventBus
    private lateinit var locationService: PlayerLocationService
    private lateinit var realtimeClient: MobileRealtimeClient
    private lateinit var api: CompanionApi
    private lateinit var sessionStore: SessionStore
    private lateinit var context: Context

    private lateinit var viewModel: PlayerViewModel

    private val connectionStateFlow = MutableStateFlow<RealtimeConnectionState>(
        RealtimeConnectionState.Disconnected,
    )
    private val realtimeEventsFlow = MutableSharedFlow<com.prayer.pointfinder.core.network.RealtimeEnvelope>()
    private val scannedBaseIdsFlow = MutableSharedFlow<String?>()
    private val scannedPayloadsFlow = MutableSharedFlow<com.prayer.pointfinder.core.platform.NfcTagPayload?>()
    private val scanEventsFlow = MutableSharedFlow<com.prayer.pointfinder.core.platform.NfcScanEvent>()
    private val deepLinkBaseIdFlow = MutableStateFlow<String?>(null)

    private val playerAuth = AuthType.Player(
        token = "test-token",
        playerId = "player-1",
        teamId = "team-1",
        gameId = "game-1",
        displayName = "Test Player",
        gameStatus = GameStatus.LIVE,
    )

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())

        mockkStatic(Log::class)
        every { Log.v(any(), any()) } returns 0
        every { Log.d(any(), any()) } returns 0
        every { Log.i(any(), any()) } returns 0
        every { Log.w(any(), any<String>()) } returns 0
        every { Log.w(any(), any<Throwable>()) } returns 0
        every { Log.w(any(), any<String>(), any()) } returns 0
        every { Log.e(any(), any()) } returns 0
        every { Log.e(any(), any(), any()) } returns 0

        playerRepository = mockk(relaxed = true)
        nfcEventBus = mockk(relaxed = true)
        locationService = mockk(relaxed = true)
        realtimeClient = mockk(relaxed = true)
        api = mockk(relaxed = true)
        sessionStore = mockk(relaxed = true)
        context = mockk(relaxed = true)

        every { realtimeClient.connectionState } returns connectionStateFlow
        every { realtimeClient.events } returns realtimeEventsFlow
        every { nfcEventBus.scannedBaseIds } returns scannedBaseIdsFlow
        every { nfcEventBus.scannedPayloads } returns scannedPayloadsFlow
        every { nfcEventBus.scanEvents } returns scanEventsFlow
        every { nfcEventBus.deepLinkBaseId } returns deepLinkBaseIdFlow

        viewModel = PlayerViewModel(
            playerRepository = playerRepository,
            nfcEventBus = nfcEventBus,
            locationService = locationService,
            realtimeClient = realtimeClient,
            api = api,
            sessionStore = sessionStore,
            context = context,
        )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        unmockkStatic(Log::class)
    }

    // --- Initial state ---

    @Test
    fun `initial state is not loading and has empty progress`() {
        val state = viewModel.state.value
        assertFalse(state.isLoading)
        assertTrue(state.progress.isEmpty())
        assertNull(state.selectedBase)
        assertNull(state.gameStatus)
        assertNull(state.solveError)
        assertFalse(state.authExpired)
        assertFalse(state.realtimeConnected)
    }

    // --- refresh() success ---

    @Test
    fun `refresh success loads progress and updates state`() = runTest {
        val bases = listOf(
            BaseProgress(
                baseId = "base-1",
                challengeTitle = "Find the flag",
                lat = 47.0,
                lng = 8.0,
                nfcLinked = true,
                status = BaseStatus.NOT_VISITED,
            ),
            BaseProgress(
                baseId = "base-2",
                challengeTitle = "Solve the riddle",
                lat = 48.0,
                lng = 9.0,
                nfcLinked = false,
                status = BaseStatus.CHECKED_IN,
            ),
        )
        coEvery { playerRepository.loadProgress(playerAuth, true) } returns ProgressResult(
            progress = bases,
            gameStatus = GameStatus.LIVE,
        )

        viewModel.refresh(playerAuth, online = true)

        val state = viewModel.state.value
        assertFalse(state.isLoading)
        assertEquals(2, state.progress.size)
        assertEquals("base-1", state.progress[0].baseId)
        assertEquals("base-2", state.progress[1].baseId)
        assertEquals(GameStatus.LIVE, state.gameStatus)
        assertFalse(state.authExpired)
        assertNull(state.solveError)
    }

    // --- refresh() error ---

    @Test
    fun `refresh error sets solveError`() = runTest {
        coEvery { playerRepository.loadProgress(playerAuth, true) } throws
            RuntimeException("Network timeout")

        viewModel.refresh(playerAuth, online = true)

        val state = viewModel.state.value
        assertFalse(state.isLoading)
        assertTrue(state.solveError != null)
    }

    // --- selectBase() ---

    @Test
    fun `selectBase sets selectedBase and loads cached challenge`() = runTest {
        val base = BaseProgress(
            baseId = "base-1",
            challengeTitle = "Find the flag",
            lat = 47.0,
            lng = 8.0,
            nfcLinked = true,
            status = BaseStatus.NOT_VISITED,
        )
        val challengeInfo = mockk<CheckInResponse.ChallengeInfo>(relaxed = true)
        coEvery { playerRepository.cachedChallenge(playerAuth, "base-1") } returns challengeInfo

        viewModel.selectBase(playerAuth, base)

        val state = viewModel.state.value
        assertEquals(base, state.selectedBase)
        assertEquals(challengeInfo, state.selectedChallenge)
    }

    // --- clearSelectedBase() ---

    @Test
    fun `clearSelectedBase resets selectedBase and selectedChallenge`() = runTest {
        // First select a base
        val base = BaseProgress(
            baseId = "base-1",
            challengeTitle = "Find the flag",
            lat = 47.0,
            lng = 8.0,
            nfcLinked = true,
            status = BaseStatus.NOT_VISITED,
        )
        coEvery { playerRepository.cachedChallenge(playerAuth, "base-1") } returns null
        viewModel.selectBase(playerAuth, base)
        assertEquals(base, viewModel.state.value.selectedBase)

        // Now clear
        viewModel.clearSelectedBase()

        val state = viewModel.state.value
        assertNull(state.selectedBase)
        assertNull(state.selectedChallenge)
    }

    // --- checkForFailedActions() with failed actions ---

    @Test
    fun `checkForFailedActions with failed actions sets solveError`() = runTest {
        coEvery { playerRepository.hasPermanentlyFailedActions(playerAuth) } returns true
        every { context.getString(any()) } returns "Some actions failed permanently"

        viewModel.checkForFailedActions(playerAuth)

        val state = viewModel.state.value
        assertEquals("Some actions failed permanently", state.solveError)
    }

    // --- checkForFailedActions() with no failed actions ---

    @Test
    fun `checkForFailedActions with no failed actions does not set solveError`() = runTest {
        coEvery { playerRepository.hasPermanentlyFailedActions(playerAuth) } returns false

        viewModel.checkForFailedActions(playerAuth)

        val state = viewModel.state.value
        assertNull(state.solveError)
    }

    // --- realtime connection state ---

    @Test
    fun `realtime connection state updates realtimeConnected flag`() = runTest {
        assertFalse(viewModel.state.value.realtimeConnected)

        connectionStateFlow.value = RealtimeConnectionState.Connected

        assertTrue(viewModel.state.value.realtimeConnected)
    }

    // --- clearCheckIn resets active check-in ---

    @Test
    fun `clearCheckIn resets activeCheckIn to null`() {
        viewModel.clearCheckIn()

        assertNull(viewModel.state.value.activeCheckIn)
    }

    // --- setAnswerText ---

    @Test
    fun `setAnswerText updates answerText in state`() {
        viewModel.setAnswerText("my answer")

        assertEquals("my answer", viewModel.state.value.answerText)
    }

    // --- refresh clears previous errors ---

    @Test
    fun `refresh clears previous scanError and solveError`() = runTest {
        coEvery { playerRepository.loadProgress(playerAuth, true) } returns ProgressResult(
            progress = emptyList(),
            gameStatus = GameStatus.LIVE,
        )

        // Set an error first via setSolveError
        viewModel.setSolveError("previous error")
        assertEquals("previous error", viewModel.state.value.solveError)

        // Refresh should clear it
        viewModel.refresh(playerAuth, online = true)

        val state = viewModel.state.value
        assertNull(state.solveError)
        assertNull(state.scanError)
    }
}
