package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateAdminOrgRequest;
import com.prayer.pointfinder.dto.request.CreateOrgInvoiceRequest;
import com.prayer.pointfinder.dto.request.TransferOrgOwnershipRequest;
import com.prayer.pointfinder.dto.request.UpdateAdminOrgRequest;
import com.prayer.pointfinder.dto.response.AdminCreateOrgResponse;
import com.prayer.pointfinder.dto.response.OrgInvoiceResponse;
import com.prayer.pointfinder.dto.response.OrgResponse;
import com.prayer.pointfinder.service.AdminOrgService;
import com.prayer.pointfinder.service.OrgInvoiceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Sales-led club administration. The whole {@code /api/admin/**} tree is
 * restricted to the ADMIN role by SecurityConfig, so these methods do not
 * repeat the check.
 */
@RestController
@RequestMapping("/api/admin/orgs")
@RequiredArgsConstructor
public class AdminOrgController {

    private final AdminOrgService adminOrgService;
    private final OrgInvoiceService orgInvoiceService;

    @PostMapping
    public ResponseEntity<AdminCreateOrgResponse> createOrg(
            @Valid @RequestBody CreateAdminOrgRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost) {
        // Audit 12.7: only X-Forwarded-Host, never the spoofable Host header.
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(adminOrgService.createOrg(request, forwardedHost));
    }

    @PatchMapping("/{orgId}")
    public ResponseEntity<OrgResponse> updateOrg(@PathVariable UUID orgId,
                                                  @Valid @RequestBody UpdateAdminOrgRequest request) {
        return ResponseEntity.ok(adminOrgService.updateOrg(orgId, request));
    }

    @PostMapping("/{orgId}/transfer-ownership")
    public ResponseEntity<OrgResponse> transferOwnership(
            @PathVariable UUID orgId,
            @Valid @RequestBody TransferOrgOwnershipRequest request) {
        return ResponseEntity.ok(adminOrgService.transferOwnership(orgId, request.getUserId()));
    }

    @PostMapping("/{orgId}/invoices")
    public ResponseEntity<OrgInvoiceResponse> issueInvoice(
            @PathVariable UUID orgId,
            @Valid @RequestBody CreateOrgInvoiceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(orgInvoiceService.issueInvoice(orgId, request));
    }

    @GetMapping("/{orgId}/invoices")
    public ResponseEntity<List<OrgInvoiceResponse>> listInvoices(@PathVariable UUID orgId) {
        return ResponseEntity.ok(orgInvoiceService.listInvoicesForAdmin(orgId));
    }
}
