package com.prayer.pointfinder.dto.response;

import java.util.UUID;

/**
 * OW-40: one base route of a game as seen by a team. A route is a stage's
 * bases, or the bases without a stage ({@code stageId} null, the default
 * route). {@code nextRequiredBaseNumber} is null when the route is not
 * enforced or the team has checked in at every base of it.
 */
public record RouteStatusResponse(UUID stageId, boolean enforceBaseOrder, Integer nextRequiredBaseNumber) {}
