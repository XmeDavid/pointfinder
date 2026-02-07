package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.CreateInviteRequest;
import com.dbv.scoutmission.dto.response.InviteResponse;
import com.dbv.scoutmission.service.InviteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/invites")
@RequiredArgsConstructor
public class InviteController {

    private final InviteService inviteService;

    @GetMapping
    public ResponseEntity<List<InviteResponse>> getGlobalInvites() {
        return ResponseEntity.ok(inviteService.getGlobalInvites());
    }

    @GetMapping("/game/{gameId}")
    public ResponseEntity<List<InviteResponse>> getGameInvites(@PathVariable UUID gameId) {
        return ResponseEntity.ok(inviteService.getGameInvites(gameId));
    }

    @GetMapping("/my")
    public ResponseEntity<List<InviteResponse>> getMyInvites() {
        return ResponseEntity.ok(inviteService.getMyInvites());
    }

    @PostMapping
    public ResponseEntity<InviteResponse> createInvite(@Valid @RequestBody CreateInviteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(inviteService.createInvite(request));
    }

    @PostMapping("/{inviteId}/accept")
    public ResponseEntity<Void> acceptInvite(@PathVariable UUID inviteId) {
        inviteService.acceptInvite(inviteId);
        return ResponseEntity.ok().build();
    }
}
