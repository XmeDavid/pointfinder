package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.AccountMeResponse;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** The signed-in account as the player app sees it: identity, verification, participations. */
@Service
@RequiredArgsConstructor
public class AccountService {

    private final UserRepository userRepository;
    private final PlayerRepository playerRepository;
    private final UserService userService;

    @Transactional(readOnly = true)
    public AccountMeResponse me(User authUser) {
        User user = userRepository.findById(authUser.getId()).orElseThrow(() -> new BadRequestException("User not found"));
        List<AccountMeResponse.Participation> participations = playerRepository.findByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(AccountService::toParticipation)
                .toList();
        return new AccountMeResponse(user.getId(), user.getEmail(), user.getName(), user.getRole().name(),
                Boolean.TRUE.equals(user.getEmailVerified()), participations);
    }

    /**
     * A participant deletes its own account from the player app. Participations stay
     * behind as guests, so a team never loses a member's progress. Operators use the
     * profile page, which also checks for owned games.
     */
    @Transactional(timeout = 10)
    public void deleteParticipant(User authUser) {
        User user = userRepository.findById(authUser.getId()).orElseThrow(() -> new BadRequestException("User not found"));
        if (user.getRole() != UserRole.participant) {
            throw new BadRequestException("Operators delete their account from the profile page");
        }
        userService.deleteAccount(user.getId());
    }

    private static AccountMeResponse.Participation toParticipation(Player p) {
        return new AccountMeResponse.Participation(
                p.getId(),
                p.getGame().getId(),
                p.getGame().getName(),
                p.getGame().getStatus().name(),
                p.getTeam().getId(),
                p.getTeam().getName(),
                p.getTeam().getColor(),
                p.getCreatedAt());
    }
}
