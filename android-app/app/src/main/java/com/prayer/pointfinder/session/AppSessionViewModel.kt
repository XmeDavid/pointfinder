package com.prayer.pointfinder.session

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.prayer.pointfinder.core.data.repo.AuthRepository
import com.prayer.pointfinder.core.data.repo.OfflineSyncWorker
import com.prayer.pointfinder.core.data.repo.PlayerRepository
import com.prayer.pointfinder.core.data.repo.SessionStore
import com.prayer.pointfinder.core.i18n.LocaleManager
import com.prayer.pointfinder.core.model.AuthType
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

data class AppSessionState(
    val authType: AuthType = AuthType.None,
    val isLoading: Boolean = false,
    val isDeletingAccount: Boolean = false,
    val isOnline: Boolean = true,
    val pendingActionsCount: Int = 0,
    val currentLanguage: String = "en",
    val errorMessage: String? = null,
    val showPermissionDisclosure: Boolean = false,
)

@HiltViewModel
class AppSessionViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val playerRepository: PlayerRepository,
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

    init {
        restoreSession()
        observeNetwork()
        pollPendingCount()
    }

    private fun observeNetwork() {
        viewModelScope.launch {
            networkMonitor.isOnline.collectLatest { online ->
                _state.value = _state.value.copy(isOnline = online)
                if (online && _state.value.authType is AuthType.Player && _state.value.pendingActionsCount > 0) {
                    OfflineSyncWorker.enqueue(context)
                }
            }
        }
    }

    private fun pollPendingCount() {
        viewModelScope.launch {
            while (true) {
                val count = playerRepository.pendingCount()
                _state.value = _state.value.copy(pendingActionsCount = count)
                delay(2_000L)
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
            _state.value = _state.value.copy(currentLanguage = resolvedLanguage)
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
                    errorMessage = ApiErrorParser.extractMessage(err),
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
                    errorMessage = ApiErrorParser.extractMessage(err),
                )
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            val currentLanguage = _state.value.currentLanguage
            val isOnline = _state.value.isOnline
            authRepository.clearSession()
            playerRepository.clearAll()
            locationService.stop()
            realtimeClient.disconnect()
            _state.value = AppSessionState(
                isOnline = isOnline,
                currentLanguage = currentLanguage,
            )
        }
    }

    fun deletePlayerAccount() {
        if (_state.value.authType !is AuthType.Player) return
        viewModelScope.launch {
            val currentLanguage = _state.value.currentLanguage
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
                )
            }.onFailure { err ->
                _state.value = _state.value.copy(
                    isDeletingAccount = false,
                    errorMessage = ApiErrorParser.extractMessage(err),
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

    private fun registerPushTokenIfPossible() {
        viewModelScope.launch {
            val auth = _state.value.authType
            if (auth is AuthType.None) return@launch
            val token = pushTokenProvider.tokenOrNull() ?: return@launch
            runCatching { authRepository.registerPushToken(token) }
        }
    }
}
