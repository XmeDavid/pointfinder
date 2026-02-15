package com.prayer.pointfinder.core.data.repo

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.prayer.pointfinder.core.model.AuthType
import com.prayer.pointfinder.core.model.OperatorAuthResponse
import com.prayer.pointfinder.core.model.PlayerAuthResponse
import com.prayer.pointfinder.core.network.AuthTokenProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.first

private val Context.sessionDataStore by preferencesDataStore(name = "companion_session")

@Singleton
class SessionStore @Inject constructor(
    @ApplicationContext private val context: Context,
) : AuthTokenProvider {

    /**
     * In-memory cache of the current auth type.
     * Avoids runBlocking on the OkHttp interceptor hot path.
     * Updated by savePlayerSession / saveOperatorSession / clearSession.
     */
    @Volatile
    private var cachedAuthType: AuthType? = null
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val securePrefs = EncryptedSharedPreferences.create(
        context,
        "companion_tokens",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    suspend fun savePlayerSession(response: PlayerAuthResponse) {
        securePrefs.edit().putString(KEY_PLAYER_TOKEN, response.token).apply()
        context.sessionDataStore.edit { prefs ->
            prefs[AUTH_TYPE] = AUTH_PLAYER
            prefs[PLAYER_ID] = response.player.id
            prefs[TEAM_ID] = response.team.id
            prefs[GAME_ID] = response.game.id
            prefs[DISPLAY_NAME] = response.player.displayName
            prefs[GAME_NAME] = response.game.name
            prefs[TEAM_NAME] = response.team.name
            prefs[TEAM_COLOR] = response.team.color
            prefs[GAME_STATUS] = response.game.status
        }
        cachedAuthType = currentAuthType()
    }

    suspend fun saveOperatorSession(response: OperatorAuthResponse) {
        securePrefs.edit()
            .putString(KEY_OPERATOR_ACCESS, response.accessToken)
            .putString(KEY_OPERATOR_REFRESH, response.refreshToken)
            .apply()
        context.sessionDataStore.edit { prefs ->
            prefs[AUTH_TYPE] = AUTH_OPERATOR
            prefs[OPERATOR_ID] = response.user.id
            prefs[OPERATOR_NAME] = response.user.name
        }
        cachedAuthType = currentAuthType()
    }

    suspend fun updateOperatorTokens(accessToken: String, refreshToken: String, userId: String) {
        securePrefs.edit()
            .putString(KEY_OPERATOR_ACCESS, accessToken)
            .putString(KEY_OPERATOR_REFRESH, refreshToken)
            .apply()
        context.sessionDataStore.edit { prefs ->
            prefs[AUTH_TYPE] = AUTH_OPERATOR
            prefs[OPERATOR_ID] = userId
        }
        cachedAuthType = currentAuthType()
    }

    suspend fun clearSession() {
        securePrefs.edit().clear().apply()
        context.sessionDataStore.edit { it.clear() }
        cachedAuthType = AuthType.None
    }

    suspend fun currentAuthType(): AuthType {
        val prefs = context.sessionDataStore.data.first()
        val resolved = when (prefs[AUTH_TYPE]) {
            AUTH_PLAYER -> {
                val token = securePrefs.getString(KEY_PLAYER_TOKEN, null)
                val playerId = prefs[PLAYER_ID]
                val teamId = prefs[TEAM_ID]
                val gameId = prefs[GAME_ID]
                if (token.isNullOrBlank() || playerId.isNullOrBlank() || teamId.isNullOrBlank() || gameId.isNullOrBlank()) {
                    AuthType.None
                } else {
                    AuthType.Player(
                        token = token,
                        playerId = playerId,
                        teamId = teamId,
                        gameId = gameId,
                        displayName = prefs[DISPLAY_NAME].orEmpty(),
                        gameName = prefs[GAME_NAME],
                        teamName = prefs[TEAM_NAME],
                        teamColor = prefs[TEAM_COLOR],
                        gameStatus = prefs[GAME_STATUS],
                    )
                }
            }

            AUTH_OPERATOR -> {
                val accessToken = securePrefs.getString(KEY_OPERATOR_ACCESS, null)
                val refreshToken = securePrefs.getString(KEY_OPERATOR_REFRESH, null)
                val userId = prefs[OPERATOR_ID]
                if (accessToken.isNullOrBlank() || refreshToken.isNullOrBlank() || userId.isNullOrBlank()) {
                    AuthType.None
                } else {
                    AuthType.Operator(
                        accessToken = accessToken,
                        refreshToken = refreshToken,
                        userId = userId,
                        userName = prefs[OPERATOR_NAME].orEmpty(),
                    )
                }
            }

            else -> AuthType.None
        }
        cachedAuthType = resolved
        return resolved
    }

    suspend fun setPreferredLanguage(languageCode: String) {
        context.sessionDataStore.edit { prefs ->
            prefs[PREFERRED_LANGUAGE] = languageCode
        }
    }

    suspend fun preferredLanguage(): String? {
        return context.sessionDataStore.data.first()[PREFERRED_LANGUAGE]
    }

    suspend fun isPermissionDisclosureSeen(): Boolean {
        return context.sessionDataStore.data.first()[PERMISSION_DISCLOSURE_SEEN] == "true"
    }

    suspend fun setPermissionDisclosureSeen() {
        context.sessionDataStore.edit { prefs ->
            prefs[PERMISSION_DISCLOSURE_SEEN] = "true"
        }
    }

    override fun currentToken(): String? {
        return when (authType()) {
            is AuthType.Player -> securePrefs.getString(KEY_PLAYER_TOKEN, null)
            is AuthType.Operator -> securePrefs.getString(KEY_OPERATOR_ACCESS, null)
            AuthType.None -> null
        }
    }

    fun currentRefreshToken(): String? = securePrefs.getString(KEY_OPERATOR_REFRESH, null)

    override fun authType(): AuthType {
        // Return cached value to avoid blocking the OkHttp thread.
        // The cache is populated by save/clear/restore calls on the main coroutine.
        return cachedAuthType ?: AuthType.None
    }

    fun playerToken(): String? = securePrefs.getString(KEY_PLAYER_TOKEN, null)
    fun operatorToken(): String? = securePrefs.getString(KEY_OPERATOR_ACCESS, null)

    companion object {
        private const val KEY_PLAYER_TOKEN = "player_token"
        private const val KEY_OPERATOR_ACCESS = "operator_access_token"
        private const val KEY_OPERATOR_REFRESH = "operator_refresh_token"

        private const val AUTH_PLAYER = "player"
        private const val AUTH_OPERATOR = "operator"

        private val AUTH_TYPE = stringPreferencesKey("auth_type")
        private val PLAYER_ID = stringPreferencesKey("player_id")
        private val TEAM_ID = stringPreferencesKey("team_id")
        private val GAME_ID = stringPreferencesKey("game_id")
        private val DISPLAY_NAME = stringPreferencesKey("display_name")
        private val GAME_NAME = stringPreferencesKey("game_name")
        private val TEAM_NAME = stringPreferencesKey("team_name")
        private val TEAM_COLOR = stringPreferencesKey("team_color")
        private val GAME_STATUS = stringPreferencesKey("game_status")
        private val OPERATOR_ID = stringPreferencesKey("operator_id")
        private val OPERATOR_NAME = stringPreferencesKey("operator_name")
        private val PREFERRED_LANGUAGE = stringPreferencesKey("preferred_language")
        private val PERMISSION_DISCLOSURE_SEEN = stringPreferencesKey("permission_disclosure_seen")
    }
}
