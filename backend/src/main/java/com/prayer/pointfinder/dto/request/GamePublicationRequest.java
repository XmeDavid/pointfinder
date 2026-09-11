package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.UUID;

/**
 * PF-07: the public summary a publisher writes for Explore. Saving it creates
 * or updates the draft without changing whether the game is listed.
 *
 * <p>The listing has no separate public title: it is always the game's own
 * name. {@code title} is still accepted so older clients (and the current
 * web client, which sends {@code title = game.name}) keep working, but it is
 * ignored. {@code place} is an area label; {@code lat}/{@code lng} stay
 * optional and are not sent by the current client.
 */
@Data
public class GamePublicationRequest {
    /** Accepted for request compatibility and ignored; the title is the game name. */
    @Size(max = 255, message = "Title must not exceed 255 characters")
    private String title;

    @NotBlank
    @Size(max = 2000, message = "Summary must not exceed 2000 characters")
    private String summary;

    @NotBlank
    @Size(max = 120, message = "Place must not exceed 120 characters")
    private String place;

    /** Approximate public location, entered on purpose. Both or neither; never a base. */
    @DecimalMin(value = "-90.0") @DecimalMax(value = "90.0")
    private Double lat;

    @DecimalMin(value = "-180.0") @DecimalMax(value = "180.0")
    private Double lng;

    /** One of coast, forest, city, other. */
    @NotBlank
    @Size(max = 32)
    private String category = "other";

    /** A team of this game that Explore may place new accounts on; null keeps public admission disabled. */
    private UUID admissionTeamId;
}
