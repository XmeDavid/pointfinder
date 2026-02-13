package com.prayer.pointfinder.core.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import retrofit2.HttpException

/**
 * Parses backend error responses from Retrofit [HttpException].
 *
 * The backend returns errors as:
 * ```json
 * {"status": 401, "message": "Invalid email or password", "errors": null, "timestamp": "..."}
 * ```
 *
 * Without this parser, [HttpException.message] returns the HTTP status text
 * (e.g. "HTTP 401 Unauthorized"), not the backend's user-facing message.
 */
object ApiErrorParser {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Serializable
    private data class ErrorResponse(
        val message: String,
        val status: Int = 0,
        val errors: Map<String, String>? = null,
    )

    /**
     * Extracts a user-facing error message from a [Throwable].
     *
     * Priority:
     * 1. Backend `ErrorResponse.message` from [HttpException.errorBody]
     * 2. HTTP status message from [HttpException.message]
     * 3. [Throwable.message]
     * 4. Generic fallback
     */
    fun extractMessage(throwable: Throwable): String {
        if (throwable is HttpException) {
            val body = runCatching { throwable.response()?.errorBody()?.string() }.getOrNull()
            if (!body.isNullOrBlank()) {
                val parsed = runCatching { json.decodeFromString<ErrorResponse>(body) }.getOrNull()
                if (parsed != null && parsed.message.isNotBlank()) {
                    return parsed.message
                }
            }
            return throwable.message() ?: throwable.message ?: "Unknown error"
        }
        return throwable.message ?: "Unknown error"
    }
}
