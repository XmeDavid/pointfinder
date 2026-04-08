package com.prayer.pointfinder.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Pure unit coverage for {@link AuditExportService#csvCell(String)}. These
 * tests do not need Spring or Testcontainers and therefore run even under
 * {@code make test-backend-docker} where the integration test suite is
 * skipped due to the pre-existing Docker-in-Docker limitation. They pin the
 * RFC-4180-style escape rules the CSV exporter depends on.
 */
class AuditExportCsvEscapeTest {

    @Test
    void nullBecomesEmptyCell() {
        assertEquals("", AuditExportService.csvCell(null));
    }

    @Test
    void emptyStringStaysEmpty() {
        assertEquals("", AuditExportService.csvCell(""));
    }

    @Test
    void plainTextIsNotQuoted() {
        assertEquals("hello world", AuditExportService.csvCell("hello world"));
    }

    @Test
    void embeddedCommaTriggersQuoting() {
        assertEquals("\"Smith, John\"", AuditExportService.csvCell("Smith, John"));
    }

    @Test
    void embeddedDoubleQuoteIsEscapedByDoubling() {
        assertEquals("\"She said \"\"hi\"\"\"",
                AuditExportService.csvCell("She said \"hi\""));
    }

    @Test
    void embeddedCommaAndQuoteCombineCleanly() {
        assertEquals("\"Scout \"\"Nickname\"\", Jr.\"",
                AuditExportService.csvCell("Scout \"Nickname\", Jr."));
    }

    @Test
    void embeddedNewlineTriggersQuoting() {
        assertEquals("\"line one\nline two\"",
                AuditExportService.csvCell("line one\nline two"));
    }

    @Test
    void embeddedCarriageReturnTriggersQuoting() {
        assertEquals("\"line one\rline two\"",
                AuditExportService.csvCell("line one\rline two"));
    }

    @Test
    void uuidLikeStringIsNotQuoted() {
        String uuid = "11111111-1111-1111-1111-111111111111";
        assertEquals(uuid, AuditExportService.csvCell(uuid));
    }

    @Test
    void isoTimestampIsNotQuoted() {
        String ts = "2026-03-15T14:30:00Z";
        assertEquals(ts, AuditExportService.csvCell(ts));
    }
}
