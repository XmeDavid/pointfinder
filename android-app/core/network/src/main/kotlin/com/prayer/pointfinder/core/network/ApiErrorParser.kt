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
                if (parsed != null) {
                    val fieldMessage = extractFieldMessage(parsed.errors)
                    if (!fieldMessage.isNullOrBlank()) {
                        return fieldMessage
                    }
                    if (parsed.message.isNotBlank()) {
                        return parsed.message
                    }
                }
            }
            return throwable.message() ?: throwable.message ?: "Unknown error"
        }
        return throwable.message ?: "Unknown error"
    }

    private fun extractFieldMessage(errors: Map<String, String>?): String? {
        if (errors.isNullOrEmpty()) return null
        val preferredFields = listOf("joinCode", "displayName", "deviceId")
        for (field in preferredFields) {
            val msg = errors[field]
            if (!msg.isNullOrBlank()) return msg
        }
        return errors.values.firstOrNull { it.isNotBlank() }
    }

    fun isAuthExpired(throwable: Throwable): Boolean {
        if (throwable is HttpException) {
            val status = throwable.code()
            return status == 401 || status == 403
        }
        return false
    }
}
