package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.OperatorLoginRequest
import com.prayer.pointfinder.core.model.PlayerJoinRequest
import com.prayer.pointfinder.core.network.CompanionApi
import com.prayer.pointfinder.core.network.TokenRefresher
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

@Singleton
class AuthRepository @Inject constructor(
    private val api: CompanionApi,
    private val sessionStore: SessionStore,
) {
    suspend fun restoreAuth(): AuthType = sessionStore.currentAuthType()

    suspend fun playerJoin(joinCode: String, displayName: String, deviceId: String): AuthType.Player {
        val response = api.playerJoin(
            PlayerJoinRequest(
                joinCode = joinCode.trim(),
                displayName = displayName.trim(),
                deviceId = deviceId,
            ),
        )
        sessionStore.savePlayerSession(response)
        return AuthType.Player(
            token = response.token,
            playerId = response.player.id,
            teamId = response.team.id,
            gameId = response.game.id,
            displayName = response.player.displayName,
            gameName = response.game.name,
            teamName = response.team.name,
            teamColor = response.team.color,
            gameStatus = response.game.status,
        )
    }

    suspend fun operatorLogin(email: String, password: String): AuthType.Operator {
        val response = api.operatorLogin(
            OperatorLoginRequest(
                email = email.trim().lowercase(Locale.ROOT),
                password = password,
            ),
        )
        sessionStore.saveOperatorSession(response)
        return AuthType.Operator(
            accessToken = response.accessToken,
            refreshToken = response.refreshToken,
            userId = response.user.id,
            userName = response.user.name,
        )
    }

    suspend fun registerPushToken(token: String) {
        when (sessionStore.currentAuthType()) {
            is AuthType.Player -> api.registerPushToken(
                com.prayer.pointfinder.core.model.PushTokenRequest(
                    pushToken = token,
                    platform = "android",
                ),
            )
            is AuthType.Operator -> api.registerUserPushToken(
                com.prayer.pointfinder.core.model.PushTokenRequest(
                    pushToken = token,
                    platform = "android",
                ),
            )
            AuthType.None -> Unit
        }
    }

    suspend fun deletePlayerAccount() {
        api.deleteMyPlayerData()
        sessionStore.clearSession()
    }

    suspend fun clearSession() {
        sessionStore.clearSession()
    }
}

@Singleton
class OperatorTokenRefresher @Inject constructor(
    @javax.inject.Named("refresh") private val api: CompanionApi,
    private val sessionStore: SessionStore,
) : TokenRefresher {
    private val refreshLock = Mutex()

    override fun refreshTokenBlocking(): String? {
        // Use cached authType() to avoid blocking DataStore read on OkHttp thread.
        if (sessionStore.authType() !is AuthType.Operator) {
            return null
        }

        return runBlocking {
            refreshLock.withLock {
                // Re-read inside the lock so concurrent 401s don't refresh with stale tokens.
                val auth = sessionStore.authType() as? AuthType.Operator ?: return@withLock null
                val refreshed = runCatching {
                    api.refreshToken(
                        com.prayer.pointfinder.core.model.RefreshTokenRequest(
                            refreshToken = auth.refreshToken,
                        ),
                    )
                }.getOrNull() ?: return@withLock null

                sessionStore.updateOperatorTokens(
                    accessToken = refreshed.accessToken,
                    refreshToken = refreshed.refreshToken,
                    userId = refreshed.user.id,
                )
                refreshed.accessToken
            }
        }
    }

    fun createLocalActionId(): String = UUID.randomUUID().toString()
}
