package com.prayer.pointfinder.core.network

import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

class TokenAuthenticator(
    private val tokenRefresher: TokenRefresher,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        // Avoid retry loops if refresh is not possible or has already failed.
        if (responseCount(response) >= 2) return null

        val refreshed = tokenRefresher.refreshTokenBlocking() ?: return null
        return response.request.newBuilder()
            .header("Authorization", "Bearer $refreshed")
            .build()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count += 1
            prior = prior.priorResponse
        }
        return count
    }
}
