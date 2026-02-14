package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateInviteRequest;
import com.prayer.pointfinder.dto.response.InviteResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.InviteStatus;
import com.prayer.pointfinder.entity.OperatorInvite;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.OperatorInviteRepository;
import com.prayer.pointfinder.repository.UserRepository;
import com.prayer.pointfinder.security.SecurityUtils;
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
    private final UserRepository userRepository;
    private final EmailService emailService;
    private final GameAccessService gameAccessService;

    @Transactional(readOnly = true)
    public List<InviteResponse> getGlobalInvites() {
        gameAccessService.ensureCurrentUserIsAdmin();
        return inviteRepository.findByGameIdIsNull().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<InviteResponse> getGameInvites(UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return inviteRepository.findByGameId(gameId).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<InviteResponse> getMyInvites() {
        User currentUser = SecurityUtils.getCurrentUser();
        return inviteRepository.findByEmailAndStatusAndGameIdIsNotNull(currentUser.getEmail(), InviteStatus.pending)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public InviteResponse createInvite(CreateInviteRequest request, String requestHost) {
        User currentUser = SecurityUtils.getCurrentUser();
        UUID userId = currentUser.getId();
        currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        Game game = null;
        if (request.getGameId() != null) {
            game = gameAccessService.getAccessibleGame(request.getGameId());

            // Game invites must target an existing operator
            User targetUser = userRepository.findByEmail(request.getEmail())
                    .orElseThrow(() -> new BadRequestException(
                            "No operator found with this email. Game invitations can only be sent to existing operators."));

            // Check if already an operator on this game
            boolean alreadyOperator = game.getOperators().stream()
                    .anyMatch(operator -> operator.getId().equals(targetUser.getId()));
            if (alreadyOperator) {
                throw new BadRequestException("This operator is already assigned to the game.");
            }
        } else {
            gameAccessService.ensureCurrentUserIsAdmin();
        }

        OperatorInvite invite = OperatorInvite.builder()
                .game(game)
                .email(request.getEmail())
                .token(UUID.randomUUID().toString())
                .status(InviteStatus.pending)
                .invitedBy(currentUser)
                .build();

        invite = inviteRepository.save(invite);

        // Send email notification
        if (game != null) {
            emailService.sendGameInvite(request.getEmail(), game.getName(), currentUser.getName(), requestHost);
        } else {
            emailService.sendRegistrationInvite(request.getEmail(), invite.getToken(), currentUser.getName(), requestHost);
        }

        return toResponse(invite);
    }

    @Transactional
    public void acceptInvite(UUID inviteId) {
        UUID userId = SecurityUtils.getCurrentUser().getId();
        User currentUser = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        OperatorInvite invite = inviteRepository.findById(inviteId)
                .orElseThrow(() -> new ResourceNotFoundException("Invite", inviteId));

        if (!invite.getEmail().equalsIgnoreCase(currentUser.getEmail())) {
            throw new BadRequestException("This invitation is not for you.");
        }

        if (invite.getStatus() != InviteStatus.pending) {
            throw new BadRequestException("This invitation has already been processed.");
        }

        if (invite.getGame() == null) {
            throw new BadRequestException("This is a registration invite and cannot be accepted this way.");
        }

        invite.setStatus(InviteStatus.accepted);
        inviteRepository.save(invite);

        // Add user to the game's operators
        invite.getGame().getOperators().add(currentUser);
    }

    private InviteResponse toResponse(OperatorInvite inv) {
        return InviteResponse.builder()
                .id(inv.getId())
                .gameId(inv.getGame() != null ? inv.getGame().getId() : null)
                .gameName(inv.getGame() != null ? inv.getGame().getName() : null)
                .email(inv.getEmail())
                .status(inv.getStatus().name())
                .invitedBy(inv.getInvitedBy().getId())
                .inviterName(inv.getInvitedBy().getName())
                .createdAt(inv.getCreatedAt())
                .build();
    }
}
