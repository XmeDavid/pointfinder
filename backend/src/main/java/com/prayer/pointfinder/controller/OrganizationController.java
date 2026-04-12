package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateOrgRequest;
import com.prayer.pointfinder.dto.request.InviteOrgMemberRequest;
import com.prayer.pointfinder.dto.request.UpdateMemberPermissionsRequest;
import com.prayer.pointfinder.dto.request.UpdateOrgRequest;
import com.prayer.pointfinder.dto.response.OrgMemberResponse;
import com.prayer.pointfinder.dto.response.OrgResponse;
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

    @PostMapping("/{orgId}/members/invite")
    public ResponseEntity<OrgMemberResponse> inviteMember(@PathVariable UUID orgId,
                                                           @Valid @RequestBody InviteOrgMemberRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(membershipService.addMember(orgId, request.getEmail()));
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
}
