package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateOrgInviteRequest;
import com.prayer.pointfinder.dto.request.CreateOrgRequest;
import com.prayer.pointfinder.dto.request.UpdateMemberPermissionsRequest;
import com.prayer.pointfinder.dto.request.UpdateOrgRequest;
import com.prayer.pointfinder.dto.response.OrgInviteResponse;
import com.prayer.pointfinder.dto.response.OrgMemberResponse;
import com.prayer.pointfinder.dto.response.OrgResponse;
import com.prayer.pointfinder.service.OrgInviteService;
import com.prayer.pointfinder.service.OrgMembershipService;
import com.prayer.pointfinder.service.OrganizationService;
import jakarta.servlet.http.HttpServletRequest;
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

    @GetMapping("/{orgId}/members")
    public ResponseEntity<List<OrgMemberResponse>> getMembers(@PathVariable UUID orgId) {
        return ResponseEntity.ok(membershipService.getMembers(orgId));
    }

    @DeleteMapping("/{orgId}/members/{userId}")
    public ResponseEntity<Void> removeMember(@PathVariable UUID orgId, @PathVariable UUID userId) {
        membershipService.removeMember(orgId, userId);
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
            @RequestHeader(value = "X-Forwarded-Host", required = false) String forwardedHost,
            HttpServletRequest httpRequest) {
        String requestHost = forwardedHost != null ? forwardedHost : httpRequest.getHeader("Host");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(orgInviteService.createInvite(orgId, request.getEmail(), requestHost));
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
