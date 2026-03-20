package com.prayer.pointfinder.mapper;

import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.User;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Shared mapper for converting a Game entity to a GameResponse DTO.
 * Ensures all fields are consistently included across all call sites.
 */
public final class GameResponseMapper {

    private GameResponseMapper() {
        // utility class
    }

    public static GameResponse toResponse(Game game) {
        List<UUID> operatorIds = game.getOperators().stream()
                .map(User::getId)
                .collect(Collectors.toList());

        return GameResponse.builder()
                .id(game.getId())
                .name(game.getName())
                .description(game.getDescription())
                .startDate(game.getStartDate())
                .endDate(game.getEndDate())
                .status(game.getStatus().name())
                .createdBy(game.getCreatedBy().getId())
                .operatorIds(operatorIds)
                .uniformAssignment(game.getUniformAssignment())
                .broadcastEnabled(game.getBroadcastEnabled())
                .broadcastCode(game.getBroadcastCode())
                .tileSource(game.getTileSource())
                .build();
    }
}
