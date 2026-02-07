package com.dbv.scoutmission.service;

import com.dbv.scoutmission.dto.request.CreateInviteRequest;
import com.dbv.scoutmission.dto.response.InviteResponse;
import com.dbv.scoutmission.entity.Game;
import com.dbv.scoutmission.entity.InviteStatus;
import com.dbv.scoutmission.entity.OperatorInvite;
import com.dbv.scoutmission.entity.User;
import com.dbv.scoutmission.exception.ResourceNotFoundException;
import com.dbv.scoutmission.repository.GameRepository;
import com.dbv.scoutmission.repository.OperatorInviteRepository;
import com.dbv.scoutmission.repository.UserRepository;
import com.dbv.scoutmission.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class InviteService {

    private final OperatorInviteRepository inviteRepository;
    private final GameRepository gameRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<InviteResponse> getGlobalInvites() {
        return inviteRepository.findByGameIdIsNull().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<InviteResponse> getGameInvites(UUID gameId) {
        return inviteRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public InviteResponse createInvite(CreateInviteRequest request) {
        User currentUser = SecurityUtils.getCurrentUser();
        // Re-fetch user within transaction to get fresh entity with proper session
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        Game game = null;
        if (request.getGameId() != null) {
            game = gameRepository.findById(request.getGameId())
                    .orElseThrow(() -> new ResourceNotFoundException("Game", request.getGameId()));
        }

        OperatorInvite invite = OperatorInvite.builder()
                .game(game)
                .email(request.getEmail())
                .token(UUID.randomUUID().toString())
                .status(InviteStatus.pending)
                .invitedBy(currentUser)
                .build();

        invite = inviteRepository.save(invite);
        return toResponse(invite);
    }

    private InviteResponse toResponse(OperatorInvite inv) {
        return InviteResponse.builder()
                .id(inv.getId())
                .gameId(inv.getGame() != null ? inv.getGame().getId() : null)
                .email(inv.getEmail())
                .token(inv.getToken())
                .status(inv.getStatus().name())
                .invitedBy(inv.getInvitedBy().getId())
                .createdAt(inv.getCreatedAt())
                .build();
    }
}
