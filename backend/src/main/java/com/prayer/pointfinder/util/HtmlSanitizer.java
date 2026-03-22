package com.prayer.pointfinder.util;

import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;

public final class HtmlSanitizer {

    private static final PolicyFactory POLICY = new HtmlPolicyBuilder()
            // Block-level
            .allowElements("p", "div", "br", "hr")
            .allowElements("h1", "h2", "h3", "h4", "h5", "h6")
            .allowElements("blockquote", "pre", "code")
            // Inline
            .allowElements("strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "span")
            // Lists
            .allowElements("ul", "ol", "li")
            // Tables
            .allowElements("table", "thead", "tbody", "tr", "th", "td")
            // Links
            .allowElements("a")
            .allowAttributes("href", "target", "rel").onElements("a")
            .allowUrlProtocols("https", "http")
            .requireRelNofollowOnLinks()
            // Images — allow data: URIs for inline base64 images
            .allowElements("img")
            .allowAttributes("alt", "width", "height").onElements("img")
            .allowAttributes("src").onElements("img")
            .allowUrlProtocols("https", "http", "data")
            .allowAttributes("style").onElements("img")
            // Audio (rich text editor support) — src on audio with data: for base64 inline audio
            .allowElements("audio", "source")
            .allowAttributes("src").onElements("audio", "source")
            .allowUrlProtocols("https", "http", "data")
            .allowAttributes("type").onElements("source")
            .allowAttributes("style").onElements("audio")
            // Class attribute only for styling (not inline style attribute)
            .allowAttributes("class").globally()
            .toFactory();

    private HtmlSanitizer() {}

    public static String sanitize(String html) {
        if (html == null || html.isEmpty()) {
            return html;
        }
        String sanitized = POLICY.sanitize(html);
        // OWASP strips boolean attributes like "controls" on <audio> elements.
        // Re-add controls attribute to all audio tags after sanitization.
        sanitized = sanitized.replaceAll("<audio ", "<audio controls ");
        return sanitized;
    }
}
