package com.prayer.pointfinder.core.data.variables

/**
 * Client-side {{key}} substitution used for Preview-as-team rendering.
 *
 * Mirrors the iOS + web helpers: replaces `{{key}}` with the mapped value when
 * found, leaves unknown references untouched so operators can still see them.
 */
object VariableResolver {
    private val PATTERN = Regex("""\{\{([a-zA-Z][a-zA-Z0-9_]*)}}""")

    fun resolve(text: String?, variables: Map<String, String>): String {
        if (text.isNullOrEmpty()) return ""
        return PATTERN.replace(text) { m ->
            variables[m.groupValues[1]] ?: m.value
        }
    }
}
