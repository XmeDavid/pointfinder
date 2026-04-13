package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.OrgInviteResponse;
import com.prayer.pointfinder.dto.response.OrgMemberResponse;
import com.prayer.pointfinder.dto.response.QuotaResponse;
import com.prayer.pointfinder.dto.response.WorkspaceResponse;
import com.prayer.pointfinder.service.OrgInviteService;
import com.prayer.pointfinder.service.QuotaService;
import com.prayer.pointfinder.service.WorkspaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class WorkspaceController {

    private final WorkspaceService workspaceService;
    private final QuotaService quotaService;
    private final OrgInviteService orgInviteService;

    @GetMapping("/workspaces")
    public ResponseEntity<WorkspaceResponse> getWorkspaces() {
        return ResponseEntity.ok(workspaceService.getWorkspaces());
    }

    @GetMapping("/quota/personal")
    public ResponseEntity<QuotaResponse> getPersonalQuota() {
        return ResponseEntity.ok(quotaService.getPersonalQuota());
    }

    @GetMapping("/quota/org/{orgId}")
    public ResponseEntity<QuotaResponse> getOrgQuota(@PathVariable UUID orgId) {
        return ResponseEntity.ok(quotaService.getOrgQuota(orgId));
    }

    @GetMapping("/org-invites/my")
    public ResponseEntity<List<OrgInviteResponse>> getMyOrgInvites() {
        return ResponseEntity.ok(orgInviteService.getMyOrgInvites());
    }

    @PostMapping("/org-invites/{inviteId}/accept")
    public ResponseEntity<OrgMemberResponse> acceptOrgInvite(@PathVariable UUID inviteId) {
        return ResponseEntity.ok(orgInviteService.acceptInvite(inviteId));
    }
}
