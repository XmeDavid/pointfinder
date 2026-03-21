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
            // Images - only allow safe protocols (no data: URIs)
            .allowElements("img")
            .allowAttributes("src", "alt", "width", "height").onElements("img")
            .allowUrlProtocols("https", "http")
            // Audio (rich text editor support)
            .allowElements("audio", "source")
            .allowAttributes("controls", "preload").onElements("audio")
            .allowAttributes("src", "type").onElements("source")
            // Class attribute only for styling (not inline style attribute)
            .allowAttributes("class").globally()
            .toFactory();

    private HtmlSanitizer() {}

    public static String sanitize(String html) {
        if (html == null || html.isEmpty()) {
            return html;
        }
        return POLICY.sanitize(html);
    }
}
