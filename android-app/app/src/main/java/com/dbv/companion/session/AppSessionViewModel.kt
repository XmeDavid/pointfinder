package com.dbv.companion.session

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dbv.companion.core.data.repo.AuthRepository
import com.dbv.companion.core.data.repo.OfflineSyncWorker
import com.dbv.companion.core.data.repo.PlayerRepository
import com.dbv.companion.core.data.repo.SessionStore
import com.dbv.companion.core.i18n.LocaleManager
import com.dbv.companion.core.model.AuthType
import com.dbv.companion.core.platform.DeviceIdProvider
import com.dbv.companion.core.platform.NetworkMonitor
import com.dbv.companion.core.platform.PlayerLocationService
import com.dbv.companion.core.platform.PushTokenProvider
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
    val isOnline: Boolean = true,
    val pendingActionsCount: Int = 0,
    val currentLanguage: String = "en",
    val errorMessage: String? = null,
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
    @ApplicationContext private val context: Context,
) : ViewModel() {
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
                    locationService.start(auth.gameId)
                    registerPushTokenIfPossible()
                }
                is AuthType.Operator -> Unit
                AuthType.None -> Unit
            }

            val preferred = sessionStore.preferredLanguage()
            val resolvedLanguage = LocaleManager.normalizeLanguage(preferred ?: Locale.getDefault().language)
            _state.value = _state.value.copy(currentLanguage = resolvedLanguage)
            LocaleManager.applyLanguage(resolvedLanguage)
        }
    }

    fun joinPlayer(joinCode: String, displayName: String) {
        if (joinCode.isBlank() || displayName.isBlank()) {
            _state.value = _state.value.copy(errorMessage = "Please fill all required fields.")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            runCatching {
                authRepository.playerJoin(joinCode, displayName, deviceIdProvider.deviceId())
            }.onSuccess { auth ->
                _state.value = _state.value.copy(authType = auth, isLoading = false)
                locationService.start(auth.gameId)
                registerPushTokenIfPossible()
            }.onFailure { err ->
                _state.value = _state.value.copy(isLoading = false, errorMessage = err.message)
            }
        }
    }

    fun loginOperator(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _state.value = _state.value.copy(errorMessage = "Please fill all required fields.")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)
            runCatching {
                authRepository.operatorLogin(email, password)
            }.onSuccess { auth ->
                _state.value = _state.value.copy(authType = auth, isLoading = false)
            }.onFailure { err ->
                _state.value = _state.value.copy(isLoading = false, errorMessage = err.message)
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.clearSession()
            playerRepository.clearAll()
            locationService.stop()
            _state.value = AppSessionState()
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
            if (auth !is AuthType.Player) return@launch
            val token = pushTokenProvider.tokenOrNull() ?: return@launch
            runCatching { authRepository.registerPushToken(token) }
        }
    }
}
