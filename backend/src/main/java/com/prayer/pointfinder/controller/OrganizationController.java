package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateOrgInviteRequest;
import com.prayer.pointfinder.dto.request.CreateOrgRequest;
import com.prayer.pointfinder.dto.request.TransferOrgOwnershipRequest;
import com.prayer.pointfinder.dto.request.UpdateMemberPermissionsRequest;
import com.prayer.pointfinder.dto.request.UpdateOrgRequest;
import com.prayer.pointfinder.dto.response.OrgInviteResponse;
import com.prayer.pointfinder.dto.response.OrgInvoiceResponse;
import com.prayer.pointfinder.dto.response.OrgMemberResponse;
import com.prayer.pointfinder.dto.response.OrgResponse;
import com.prayer.pointfinder.service.OrgInviteService;
import com.prayer.pointfinder.service.OrgInvoiceService;
import com.prayer.pointfinder.service.OrgMembershipService;
import com.prayer.pointfinder.service.OrganizationService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/orgs")
@RequiredArgsConstructor
public class OrganizationController {

    private final OrganizationService organizationService;
    private final OrgMembershipService membershipService;
    private final OrgInviteService orgInviteService;
    private final OrgInvoiceService orgInvoiceService;

    @PostMapping
    public ResponseEntity<OrgResponse> createOrg(@Valid @RequestBody CreateOrgRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(organizationService.createOrg(request));
    }

    @GetMapping("/{orgId}")
    public ResponseEntity<OrgResponse> getOrg(@PathVariable UUID orgId) {
        return ResponseEntity.ok(organizationService.getOrg(orgId));
    }

    @PatchMapping("/{orgId}")
    public ResponseEntity<OrgResponse> updateOrg(@PathVariable UUID orgId,
                                                  @Valid @RequestBody UpdateOrgRequest request) {
        return ResponseEntity.ok(organizationService.updateOrg(orgId, request));
    }

    @DeleteMapping("/{orgId}")
    public ResponseEntity<Void> deleteOrg(@PathVariable UUID orgId) {
        organizationService.deleteOrg(orgId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{orgId}/transfer-ownership")
    public ResponseEntity<OrgResponse> transferOwnership(
            @PathVariable UUID orgId,
            @Valid @RequestBody TransferOrgOwnershipRequest request) {
        return ResponseEntity.ok(organizationService.transferOwnership(orgId, request.getUserId()));
    }

    /** A club's own billing history. Members need MANAGE_BILLING to see it. */
    @GetMapping("/{orgId}/invoices")
    public ResponseEntity<List<OrgInvoiceResponse>> listInvoices(@PathVariable UUID orgId) {
        return ResponseEntity.ok(orgInvoiceService.listInvoicesForMember(orgId));
    }

    @GetMapping("/{orgId}/members")
    public ResponseEntity<List<OrgMemberResponse>> getMembers(@PathVariable UUID orgId) {
        return ResponseEntity.ok(membershipService.getMembers(orgId));
    }

    @DeleteMapping("/{orgId}/members/{userId}")
    public ResponseEntity<Void> removeMember(@PathVariable UUID orgId, @PathVariable UUID userId) {
        membershipService.removeMember(orgId, userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * A member's own way out of an org. The creator is refused with
     * {@code ORG_CREATOR_CANNOT_LEAVE} — they transfer ownership first.
     */
    @PostMapping("/{orgId}/leave")
    public ResponseEntity<Void> leaveOrg(@PathVariable UUID orgId) {
        membershipService.leaveOrg(orgId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{orgId}/members/{userId}/permissions")
    public ResponseEntity<OrgMemberResponse> updatePermissions(@PathVariable UUID orgId,
                                                                @PathVariable UUID userId,
                                                                @Valid @RequestBody UpdateMemberPermissionsRequest request) {
        return ResponseEntity.ok(membershipService.updatePermissions(orgId, userId, request.getPermissions()));
    }

    // --- Org invite endpoints ---

    @PostMapping("/{orgId}/invites")
    public ResponseEntity<OrgInviteResponse> createInvite(
            @PathVariable UUID orgId,
            @Valid @RequestBody CreateOrgInviteRequest request,
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost) {
        // Audit 12.7: Only use X-Forwarded-Host; no Host header fallback.
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(orgInviteService.createInvite(orgId, request.getEmail(), forwardedHost));
    }

    @GetMapping("/{orgId}/invites")
    public ResponseEntity<List<OrgInviteResponse>> listInvites(@PathVariable UUID orgId) {
        return ResponseEntity.ok(orgInviteService.getOrgInvites(orgId));
    }

    @DeleteMapping("/{orgId}/invites/{inviteId}")
    public ResponseEntity<Void> revokeInvite(@PathVariable UUID orgId, @PathVariable UUID inviteId) {
        orgInviteService.revokeInvite(orgId, inviteId);
        return ResponseEntity.noContent().build();
    }
}
