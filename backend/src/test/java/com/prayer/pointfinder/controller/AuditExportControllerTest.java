package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.AuditExportService;
import com.prayer.pointfinder.service.AuditExportService.AuditExportQuery;
import com.prayer.pointfinder.service.AuditExportService.AuditExportResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Controller-layer tests for {@link AuditExportController}.
 *
 * <p>Uses {@code @WebMvcTest} in isolation with a mocked service.
 * Security filters are disabled ({@code addFilters = false}) so the tests
 * focus on HTTP mapping, query-parameter binding, response headers, and the
 * error response shapes produced by {@link GlobalExceptionHandler} — not the
 * Spring Security layer (covered by SecurityRulesTest).
 *
 * <p>Authorization is verified via the service layer: the service calls
 * {@link com.prayer.pointfinder.service.GameAccessService#ensureCurrentUserCanAccessGame}
 * and throws {@link AccessDeniedException} on denial. We simulate that here by
 * having the mock service throw {@code AccessDeniedException} and asserting 403.
 */
@WebMvcTest(AuditExportController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class AuditExportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AuditExportService auditExportService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private com.prayer.pointfinder.security.FrozenAccountFilter frozenAccountFilter;

    // ── Fixtures ──────────────────────────────────────────────────────────────

    private static final UUID GAME_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    private String auditExportPath() {
        return "/api/games/" + GAME_ID + "/audit-export";
    }

    /** Minimal happy-path result in JSON format. */
    private AuditExportResult jsonResult(String body) {
        return new AuditExportResult(
                body,
                "application/json",
                "attachment; filename=\"audit-" + GAME_ID + "-2026-04-08.json\""
        );
    }

    /** Minimal happy-path result in CSV format. */
    private AuditExportResult csvResult(String body) {
        return new AuditExportResult(
                body,
                "text/csv; charset=utf-8",
                "attachment; filename=\"audit-" + GAME_ID + "-2026-04-08.csv\""
        );
    }

    // ── JSON happy path ───────────────────────────────────────────────────────

    @Test
    void jsonFormatHappyPathReturns200WithApplicationJsonContentType() throws Exception {
        String jsonBody = "[{\"id\":\"evt-1\"}]";
        when(auditExportService.export(any(AuditExportQuery.class))).thenReturn(jsonResult(jsonBody));

        mockMvc.perform(get(auditExportPath())
                        .param("format", "json"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/json"))
                .andExpect(content().string(jsonBody));
    }

    @Test
    void jsonFormatSetsContentDispositionAttachmentHeader() throws Exception {
        String disposition = "attachment; filename=\"audit-" + GAME_ID + "-2026-04-08.json\"";
        when(auditExportService.export(any(AuditExportQuery.class))).thenReturn(jsonResult("[]"));

        mockMvc.perform(get(auditExportPath()).param("format", "json"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", disposition));
    }

    @Test
    void noFormatParamDefaultsToJsonFormat() throws Exception {
        when(auditExportService.export(any(AuditExportQuery.class))).thenReturn(jsonResult("[]"));

        mockMvc.perform(get(auditExportPath()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/json"));

        verify(auditExportService).export(any(AuditExportQuery.class));
    }

    // ── CSV happy path ────────────────────────────────────────────────────────

    @Test
    void csvFormatHappyPathReturns200WithTextCsvContentType() throws Exception {
        String csvBody = "timestamp,type,source_surface\r\n2026-04-08T10:00:00Z,check_in,android\r\n";
        when(auditExportService.export(any(AuditExportQuery.class))).thenReturn(csvResult(csvBody));

        mockMvc.perform(get(auditExportPath())
                        .param("format", "csv"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/csv; charset=utf-8"))
                .andExpect(content().string(csvBody));
    }

    @Test
    void csvFormatSetsContentDispositionAttachmentHeader() throws Exception {
        String disposition = "attachment; filename=\"audit-" + GAME_ID + "-2026-04-08.csv\"";
        when(auditExportService.export(any(AuditExportQuery.class))).thenReturn(csvResult(""));

        mockMvc.perform(get(auditExportPath()).param("format", "csv"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", disposition));
    }

    // ── Empty result set ──────────────────────────────────────────────────────

    @Test
    void emptyResultSetReturns200WithEmptyJsonArray() throws Exception {
        when(auditExportService.export(any(AuditExportQuery.class))).thenReturn(jsonResult("[]"));

        mockMvc.perform(get(auditExportPath()).param("format", "json"))
                .andExpect(status().isOk())
                .andExpect(content().string("[]"));
    }

    @Test
    void emptyResultSetCsvReturns200WithHeaderRowOnly() throws Exception {
        // The service renders the header row even when entries list is empty.
        String headerOnly = "timestamp,type,source_surface,actor_type,actor_id,actor_display_name,"
                + "actor_device_id,team_id,team_name,base_id,base_name,challenge_id,"
                + "challenge_title,message,operator_reason,archived\r\n";
        when(auditExportService.export(any(AuditExportQuery.class))).thenReturn(csvResult(headerOnly));

        mockMvc.perform(get(auditExportPath()).param("format", "csv"))
                .andExpect(status().isOk())
                .andExpect(content().string(headerOnly));
    }

    // ── Authorization ─────────────────────────────────────────────────────────

    @Test
    void nonOperatorAccessReturns403() throws Exception {
        // The service calls GameAccessService.ensureCurrentUserCanAccessGame which
        // throws AccessDeniedException for non-operators / non-admins.
        when(auditExportService.export(any(AuditExportQuery.class)))
                .thenThrow(new AccessDeniedException("You are not authorized to perform this action"));

        mockMvc.perform(get(auditExportPath()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.message").value("You are not authorized to perform this action"));
    }

    // ── Validation errors ─────────────────────────────────────────────────────

    @Test
    void invalidFormatParamReturns400WithBadRequestException() throws Exception {
        when(auditExportService.export(any(AuditExportQuery.class)))
                .thenThrow(new BadRequestException(
                        "AUDIT_EXPORT_INVALID_FORMAT: format must be 'json' or 'csv'"));

        mockMvc.perform(get(auditExportPath()).param("format", "xlsx"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value(
                        "AUDIT_EXPORT_INVALID_FORMAT: format must be 'json' or 'csv'"));
    }

    @Test
    void invalidDateRangeToBeforeFromReturns400() throws Exception {
        when(auditExportService.export(any(AuditExportQuery.class)))
                .thenThrow(new BadRequestException(
                        "AUDIT_EXPORT_INVALID_RANGE: 'to' must be strictly after 'from'"));

        mockMvc.perform(get(auditExportPath())
                        .param("from", "2026-04-08T12:00:00Z")
                        .param("to", "2026-04-08T10:00:00Z"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value(
                        "AUDIT_EXPORT_INVALID_RANGE: 'to' must be strictly after 'from'"));
    }

    @Test
    void invalidActionTypeReturns400() throws Exception {
        when(auditExportService.export(any(AuditExportQuery.class)))
                .thenThrow(new BadRequestException(
                        "AUDIT_EXPORT_INVALID_ACTION_TYPE: 'badtype' is not a known action type"));

        mockMvc.perform(get(auditExportPath()).param("actionType", "badtype"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value(
                        "AUDIT_EXPORT_INVALID_ACTION_TYPE: 'badtype' is not a known action type"));
    }

    @Test
    void malformedTimestampReturns400() throws Exception {
        when(auditExportService.export(any(AuditExportQuery.class)))
                .thenThrow(new BadRequestException(
                        "AUDIT_EXPORT_INVALID_TIMESTAMP: 'from' must be an ISO-8601 instant"));

        mockMvc.perform(get(auditExportPath()).param("from", "not-a-date"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
    }

    // ── Query parameter forwarding ────────────────────────────────────────────

    @Test
    void allOptionalQueryParamsAreForwardedToService() throws Exception {
        UUID teamId = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        UUID playerId = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");
        UUID operatorId = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd");

        when(auditExportService.export(any(AuditExportQuery.class))).thenReturn(jsonResult("[]"));

        mockMvc.perform(get(auditExportPath())
                        .param("format", "json")
                        .param("from", "2026-04-01T00:00:00Z")
                        .param("to", "2026-04-08T00:00:00Z")
                        .param("teamId", teamId.toString())
                        .param("playerId", playerId.toString())
                        .param("operatorId", operatorId.toString())
                        .param("actionType", "check_in,submission")
                        .param("sourceSurface", "android")
                        .param("includeArchived", "true"))
                .andExpect(status().isOk());

        verify(auditExportService).export(argThat((AuditExportQuery q) ->
                GAME_ID.equals(q.gameId())
                        && "json".equals(q.format())
                        && "2026-04-01T00:00:00Z".equals(q.fromRaw())
                        && "2026-04-08T00:00:00Z".equals(q.toRaw())
                        && teamId.equals(q.teamId())
                        && playerId.equals(q.playerId())
                        && operatorId.equals(q.operatorId())
                        && "check_in,submission".equals(q.actionTypeRaw())
                        && "android".equals(q.sourceSurface())
                        && Boolean.TRUE.equals(q.includeArchived())
        ));
    }

    @Test
    void gameIdPathVariableIsForwardedToService() throws Exception {
        when(auditExportService.export(any(AuditExportQuery.class))).thenReturn(jsonResult("[]"));

        mockMvc.perform(get(auditExportPath()))
                .andExpect(status().isOk());

        verify(auditExportService).export(argThat((AuditExportQuery q) ->
                GAME_ID.equals(q.gameId())));
    }
}
