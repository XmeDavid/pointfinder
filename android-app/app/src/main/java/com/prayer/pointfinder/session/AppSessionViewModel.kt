package com.prayer.pointfinder.session

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prayer.pointfinder.core.data.repo.AuthRepository
import com.prayer.pointfinder.core.data.repo.OfflineSyncWorker
import com.prayer.pointfinder.core.data.repo.OperatorRepository
import com.prayer.pointfinder.core.data.repo.PlayerRepository
import com.prayer.pointfinder.core.data.repo.SessionStore
import com.prayer.pointfinder.core.i18n.LocaleManager
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.ThemeMode
import com.prayer.pointfinder.core.platform.DeviceIdProvider
import com.prayer.pointfinder.core.platform.NetworkMonitor
import com.prayer.pointfinder.core.platform.PlayerLocationService
import com.prayer.pointfinder.core.network.ApiErrorParser
import com.prayer.pointfinder.core.network.MobileRealtimeClient
import com.prayer.pointfinder.core.platform.PushTokenProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class AppSessionState(
    val authType: AuthType = AuthType.None,
    val isLoading: Boolean = false,
    val isDeletingAccount: Boolean = false,
    val isOnline: Boolean = true,
    val pendingActionsCount: Int = 0,
    val currentLanguage: String = "en",
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val errorMessage: String? = null,
    val showPermissionDisclosure: Boolean = false,
)

@HiltViewModel
class AppSessionViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val playerRepository: PlayerRepository,
    private val operatorRepository: OperatorRepository,
    private val sessionStore: SessionStore,
    private val networkMonitor: NetworkMonitor,
    private val deviceIdProvider: DeviceIdProvider,
    private val pushTokenProvider: PushTokenProvider,
    private val locationService: PlayerLocationService,
    private val realtimeClient: MobileRealtimeClient,
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val joinCodeRegex = Regex("^[A-Z0-9]{6,20}$")

    private val _state = MutableStateFlow(AppSessionState())
    val state: StateFlow<AppSessionState> = _state.asStateFlow()

    // Guards against concurrent logout cascades when the reconnect-time
    // tokenProvider discovers the refresh token is also expired. Without
    // this flag, a flapping socket would enqueue one logout() per reconnect
    // attempt.
    private val forcedLogoutInFlight = AtomicBoolean(false)

    init {
        configureRealtimeTokenProvider()
        restoreSession()
        observeNetwork()
        observePendingCount()
    }

    /**
     * Wires the realtime client to fetch a fresh access token on every
     * (re)connect. This covers the P0 Track 2 Slice 4 gap: operator access
     * tokens are 15 minutes; without refresh-on-reconnect an operator that
     * stays idle past expiry loses realtime updates silently.
     *
     * Mirrors the iOS `tokenProvider` wiring in `AppState.configureRealtimeClient`.
     *
     * Runs on the realtime client's single-threaded dispatcher, so the work
     * it does must not block for long. For operators we delegate to
     * [OperatorTokenRefresher] which already manages its own dispatcher and
     * has a mutex that deduplicates concurrent refreshes.
     *
     * Failure handling:
     *  - null return → caller falls back to the existing session token.
     *  - For operators, a null return means the refresh attempt was made
     *    and failed (refresh token also expired, network error). We fire
     *    a one-shot forced logout so the UI re-authenticates instead of
     *    looping forever on a dead session.
     */
    private fun configureRealtimeTokenProvider() {
        realtimeClient.tokenProvider = fun(): String? {
            return when (sessionStore.authType()) {
                is AuthType.Operator -> {
                    val refreshed = authRepository.refreshOperatorAccessTokenBlocking()
                    if (refreshed == null) {
                        Log.w(
                            TAG,
                            "Operator token refresh failed on realtime reconnect — forcing logout",
                        )
                        triggerForcedLogout()
                    }
                    refreshed
                }
                is AuthType.Player -> authRepository.currentSessionTokenBlocking()
                AuthType.None -> null
            }
        }
    }

    /**
     * Clears the session and returns the app to the auth screen. Invoked
     * from the realtime tokenProvider when operator refresh fails, so the
     * user is not stuck watching a dead dashboard.
     */
    private fun triggerForcedLogout() {
        if (!forcedLogoutInFlight.compareAndSet(false, true)) return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    // `logout()` relaunches on the viewModelScope; call the
                    // underlying repository + realtime disconnect directly
                    // to keep this path self-contained and avoid re-entering
                    // tokenProvider while it's still running.
                    authRepository.clearSession()
                }
                playerRepository.clearAll()
                operatorRepository.clearCache()
                locationService.stop()
                realtimeClient.disconnect()
                val currentLanguage = _state.value.currentLanguage
                val currentTheme = _state.value.themeMode
                val isOnline = _state.value.isOnline
                _state.value = AppSessionState(
                    isOnline = isOnline,
                    currentLanguage = currentLanguage,
                    themeMode = currentTheme,
                    errorMessage = context.getString(
                        com.prayer.pointfinder.core.i18n.R.string.error_session_expired,
                    ),
                )
            } finally {
                forcedLogoutInFlight.set(false)
            }
        }
    }

    private fun observeNetwork() {
        viewModelScope.launch {
            networkMonitor.isOnline.collectLatest { online ->
                _state.value = _state.value.copy(isOnline = online)
                if (online && _state.value.authType is AuthType.Player && _state.value.pendingActionsCount > 0) {
                    launch { playerRepository.trySyncPendingActions(_state.value.authType as AuthType.Player) }
                    OfflineSyncWorker.enqueue(context)
                }
            }
        }
    }

    private fun observePendingCount() {
        viewModelScope.launch {
            playerRepository.pendingCountFlow().collectLatest { count ->
                _state.value = _state.value.copy(pendingActionsCount = count)
            }
        }
    }

    fun restoreSession() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            val auth = authRepository.restoreAuth()
            _state.value = _state.value.copy(authType = auth, isLoading = false)
            when (auth) {
                is AuthType.Player -> {
                    realtimeClient.connect(gameId = auth.gameId, token = auth.token)
                    val seen = sessionStore.isPermissionDisclosureSeen()
                    if (seen) {
                        locationService.start(auth.gameId)
                        registerPushTokenIfPossible()
                    } else {
                        _state.value = _state.value.copy(showPermissionDisclosure = true)
                    }
                }
                is AuthType.Operator -> {
                    realtimeClient.disconnect()
                    registerPushTokenIfPossible()
                }
                AuthType.None -> realtimeClient.disconnect()
            }

            val preferred = sessionStore.preferredLanguage()
            val resolvedLanguage = LocaleManager.normalizeLanguage(preferred ?: Locale.getDefault().language)
            val savedTheme = sessionStore.preferredTheme()?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.SYSTEM
            _state.value = _state.value.copy(currentLanguage = resolvedLanguage, themeMode = savedTheme)
            LocaleManager.applyLanguage(resolvedLanguage)
        }
    }

    fun joinPlayer(joinCode: String, displayName: String) {
        val normalizedJoinCode = joinCode.trim().uppercase(Locale.ROOT)
        if (normalizedJoinCode.isBlank() || displayName.isBlank()) {
            _state.value = _state.value.copy(
                errorMessage = context.getString(com.prayer.pointfinder.core.i18n.R.string.error_missing_fields),
            )
            return
        }
        if (!joinCodeRegex.matches(normalizedJoinCode)) {
            _state.value = _state.value.copy(
                errorMessage = context.getString(com.prayer.pointfinder.core.i18n.R.string.error_invalid_join_code),
            )
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            runCatching {
                authRepository.playerJoin(normalizedJoinCode, displayName, deviceIdProvider.deviceId())
            }.onSuccess { auth ->
                realtimeClient.connect(gameId = auth.gameId, token = auth.token)
                val needsDisclosure = !sessionStore.isPermissionDisclosureSeen()
                _state.value = _state.value.copy(
                    authType = auth,
                    isLoading = false,
                    showPermissionDisclosure = needsDisclosure,
                )
                if (!needsDisclosure) {
                    locationService.start(auth.gameId)
                    registerPushTokenIfPossible()
                }
            }.onFailure { err ->
                _state.value = _state.value.copy(
                    isLoading = false,
                    errorMessage = friendlyError(err),
                )
            }
        }
    }

    fun loginOperator(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _state.value = _state.value.copy(
                errorMessage = context.getString(com.prayer.pointfinder.core.i18n.R.string.error_missing_fields),
            )
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            runCatching {
                authRepository.operatorLogin(email, password)
            }.onSuccess { auth ->
                realtimeClient.disconnect()
                _state.value = _state.value.copy(authType = auth, isLoading = false)
                registerPushTokenIfPossible()
            }.onFailure { err ->
                _state.value = _state.value.copy(
                    isLoading = false,
                    errorMessage = friendlyError(err),
                )
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            val currentLanguage = _state.value.currentLanguage
            val currentTheme = _state.value.themeMode
            val isOnline = _state.value.isOnline
            authRepository.clearSession()
            playerRepository.clearAll()
            operatorRepository.clearCache()
            locationService.stop()
            realtimeClient.disconnect()
            _state.value = AppSessionState(
                isOnline = isOnline,
                currentLanguage = currentLanguage,
                themeMode = currentTheme,
            )
        }
    }

    fun deleteOperatorAccount() {
        if (_state.value.authType !is AuthType.Operator) return
        viewModelScope.launch {
            val currentLanguage = _state.value.currentLanguage
            val currentTheme = _state.value.themeMode
            val isOnline = _state.value.isOnline
            _state.value = _state.value.copy(isDeletingAccount = true, errorMessage = null)
            runCatching {
                authRepository.deleteOperatorAccount()
            }.onSuccess {
                operatorRepository.clearCache()
                realtimeClient.disconnect()
                _state.value = AppSessionState(
                    isOnline = isOnline,
                    currentLanguage = currentLanguage,
                    themeMode = currentTheme,
                )
            }.onFailure { err ->
                _state.value = _state.value.copy(
                    isDeletingAccount = false,
                    errorMessage = friendlyError(err),
                )
            }
        }
    }

    fun deletePlayerAccount() {
        if (_state.value.authType !is AuthType.Player) return
        viewModelScope.launch {
            val currentLanguage = _state.value.currentLanguage
            val currentTheme = _state.value.themeMode
            val isOnline = _state.value.isOnline
            _state.value = _state.value.copy(isDeletingAccount = true, errorMessage = null)
            runCatching {
                authRepository.deletePlayerAccount()
            }.onSuccess {
                playerRepository.clearAll()
                locationService.stop()
                realtimeClient.disconnect()
                _state.value = AppSessionState(
                    isOnline = isOnline,
                    currentLanguage = currentLanguage,
                    themeMode = currentTheme,
                )
            }.onFailure { err ->
                _state.value = _state.value.copy(
                    isDeletingAccount = false,
                    errorMessage = friendlyError(err),
                )
            }
        }
    }

    fun onPermissionDisclosureAccepted() {
        viewModelScope.launch {
            sessionStore.setPermissionDisclosureSeen()
            _state.value = _state.value.copy(showPermissionDisclosure = false)
            // Note: location service is NOT started here because the system
            // permission dialog hasn't been shown yet. It will be started
            // from onLocationPermissionResult() after the user grants permission.
            registerPushTokenIfPossible()
        }
    }

    /**
     * Called after the system location permission dialog returns a result.
     * Starts the location service if permission was granted.
     */
    fun onLocationPermissionResult() {
        val auth = _state.value.authType
        if (auth is AuthType.Player) {
            locationService.start(auth.gameId)
        }
    }

    /** Re-check device location on resume (handles device-wide GPS toggle). */
    fun resumeLocationIfNeeded() {
        locationService.resumeIfNeeded()
    }

    private fun friendlyError(err: Throwable): String =
        if (ApiErrorParser.isNetworkError(err))
            context.getString(com.prayer.pointfinder.core.i18n.R.string.error_network_unavailable)
        else ApiErrorParser.extractMessage(err)

    fun clearError() {
        _state.value = _state.value.copy(errorMessage = null)
    }

    fun updateLanguage(languageCode: String) {
        viewModelScope.launch {
            val normalized = LocaleManager.normalizeLanguage(languageCode)
            sessionStore.setPreferredLanguage(normalized)
            LocaleManager.applyLanguage(normalized)
            _state.value = _state.value.copy(currentLanguage = normalized)
        }
    }

    fun updateThemeMode(mode: ThemeMode) {
        viewModelScope.launch {
            sessionStore.setPreferredTheme(mode.name)
            _state.value = _state.value.copy(themeMode = mode)
        }
    }

    private fun registerPushTokenIfPossible() {
        viewModelScope.launch {
            val auth = _state.value.authType
            if (auth is AuthType.None) return@launch
            val token = pushTokenProvider.tokenOrNull() ?: return@launch
            runCatching { authRepository.registerPushToken(token) }
        }
    }

    companion object {
        private const val TAG = "AppSessionViewModel"
    }
}
