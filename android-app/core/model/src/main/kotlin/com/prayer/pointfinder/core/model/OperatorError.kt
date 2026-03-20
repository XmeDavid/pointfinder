package com.prayer.pointfinder.core.model

sealed class OperatorError : Exception() {
    data class NotFound(override val message: String) : OperatorError()
    data class Unauthorized(override val message: String) : OperatorError()
    data class Conflict(override val message: String) : OperatorError()
    data class BadRequest(override val message: String) : OperatorError()
    data class NetworkError(override val cause: Throwable) : OperatorError()
    data class ServerError(override val message: String) : OperatorError()
}
