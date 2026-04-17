package com.prayer.pointfinder.core.data.variables

/**
 * Scans a set of texts for `{{key}}` references, and reports undefined ones.
 *
 * Used by the operator editor save-time guard so authors see which keys have
 * no definition before committing a challenge.
 */
object VariableReferenceScanner {
    private val PATTERN = Regex("""\{\{([a-zA-Z][a-zA-Z0-9_]*)}}""")

    fun scan(texts: List<String?>): List<String> {
        val seen = linkedSetOf<String>()
        texts.forEach { text ->
            if (text.isNullOrEmpty()) return@forEach
            PATTERN.findAll(text).forEach { seen.add(it.groupValues[1]) }
        }
        return seen.toList()
    }

    fun findUndefined(texts: List<String?>, availableKeys: Set<String>): List<String> =
        scan(texts).filter { it !in availableKeys }
}
