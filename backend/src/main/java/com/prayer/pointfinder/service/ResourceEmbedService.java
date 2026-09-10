package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.ResourceResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.CheckInRepository;
import com.prayer.pointfinder.repository.ResourceEmbedRepository;
import com.prayer.pointfinder.repository.ResourceRepository;
import com.prayer.pointfinder.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
@RequiredArgsConstructor
public class ResourceEmbedService {

    private static final Pattern RESOURCE_ID_PATTERN =
            Pattern.compile("data-resource-id=\"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\"");

    private final ResourceEmbedRepository resourceEmbedRepository;
    private final ResourceRepository resourceRepository;
    private final BaseRepository baseRepository;
    private final ChallengeRepository challengeRepository;
    private final CheckInRepository checkInRepository;
    private final SubmissionRepository submissionRepository;
    private final ObjectStorageService objectStorageService;

    /**
     * Extracts all resource UUIDs referenced by data-resource-id attributes in the given HTML.
     */
    public List<UUID> extractResourceIds(String html) {
        if (html == null || html.isBlank()) return List.of();
        List<UUID> ids = new ArrayList<>();
        Matcher matcher = RESOURCE_ID_PATTERN.matcher(html);
        while (matcher.find()) {
            try {
                ids.add(UUID.fromString(matcher.group(1)));
            } catch (IllegalArgumentException e) {
                log.warn("[EMBED] Unparseable UUID in data-resource-id: {}", matcher.group(1));
            }
        }
        return ids;
    }

    /**
     * Syncs resource_embeds for a base: removes old entries, inserts current ones.
     */
    @Transactional
    public void syncBaseEmbeds(UUID baseId, String description) {
        resourceEmbedRepository.deleteByBaseId(baseId);

        List<UUID> resourceIds = extractResourceIds(description);
        if (resourceIds.isEmpty()) return;

        Base baseRef = baseRepository.getReferenceById(baseId);

        for (UUID resourceId : resourceIds) {
            resourceRepository.findById(resourceId).ifPresent(resource -> {
                ResourceEmbed embed = ResourceEmbed.builder()
                        .resource(resource)
                        .base(baseRef)
                        .build();
                resourceEmbedRepository.save(embed);
            });
        }
        log.debug("[EMBED] syncBaseEmbeds baseId={} embeds={}", baseId, resourceIds.size());
    }

    /**
     * Syncs resource_embeds for a challenge: removes old entries, inserts current ones
     * from description, content, and completionContent combined.
     */
    @Transactional
    public void syncChallengeEmbeds(UUID challengeId, String description, String content, String completionContent) {
        resourceEmbedRepository.deleteByChallengeId(challengeId);

        Set<UUID> resourceIds = new LinkedHashSet<>();
        resourceIds.addAll(extractResourceIds(description));
        resourceIds.addAll(extractResourceIds(content));
        resourceIds.addAll(extractResourceIds(completionContent));

        if (resourceIds.isEmpty()) return;

        Challenge challengeRef = challengeRepository.getReferenceById(challengeId);

        for (UUID resourceId : resourceIds) {
            resourceRepository.findById(resourceId).ifPresent(resource -> {
                ResourceEmbed embed = ResourceEmbed.builder()
                        .resource(resource)
                        .challenge(challengeRef)
                        .build();
                resourceEmbedRepository.save(embed);
            });
        }
        log.debug("[EMBED] syncChallengeEmbeds challengeId={} embeds={}", challengeId, resourceIds.size());
    }

    /**
     * Replaces data-resource-id placeholders with download URLs and metadata so
     * players can render embedded resources. Only ids in {@code visible} are
     * resolved; any other reference stays an inert placeholder, so a document
     * cannot hand out a link to a file the team may not see.
     */
    public String enrichHtmlForPlayer(String html, Map<UUID, Resource> visible) {
        if (html == null || html.isBlank()) return html;

        StringBuffer result = new StringBuffer();
        Matcher matcher = RESOURCE_ID_PATTERN.matcher(html);

        while (matcher.find()) {
            String uuidStr = matcher.group(1);
            String replacement = matcher.group(0); // default: leave as-is
            try {
                Resource r = visible.get(UUID.fromString(uuidStr));
                if (r != null) {
                    StringBuilder attrs = new StringBuilder();
                    attrs.append("data-resource-id=\"").append(uuidStr).append("\"");
                    attrs.append(" data-resource-name=\"").append(escapeAttr(r.getName())).append("\"");
                    attrs.append(" data-resource-type=\"").append(r.getType().name()).append("\"");
                    attrs.append(" data-resource-content-type=\"").append(escapeAttr(r.getContentType())).append("\"");
                    if (r.getType() == ResourceType.file && r.getS3Key() != null && objectStorageService.isEnabled()) {
                        try {
                            String url = objectStorageService.generatePresignedUrl(r.getS3Key());
                            attrs.append(" data-resource-url=\"").append(escapeAttr(url)).append("\"");
                        } catch (Exception e) {
                            log.warn("[EMBED] Failed to generate presigned URL for resource {}: {}", uuidStr, e.getMessage());
                        }
                    }
                    replacement = attrs.toString();
                }
            } catch (IllegalArgumentException e) {
                log.warn("[EMBED] Unparseable UUID in enrichHtmlForPlayer: {}", uuidStr);
            }
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    /**
     * Everything a team may currently see in a game: resources shared with players,
     * plus resources embedded in bases the team checked in at and challenges the
     * team submitted to. The list endpoint and the download endpoint both use this
     * rule so a player can never download what the list would not show.
     */
    @Transactional(readOnly = true)
    public List<ResourceResponse> getPlayerVisibleResources(UUID gameId, UUID teamId) {
        Map<UUID, Resource> visible = visibleResources(gameId, teamId);
        return visible.values().stream().map(r -> toPlayerResponse(r, visible)).toList();
    }

    /**
     * Generates a presigned download URL for a file the calling team may see.
     * Used by player-facing endpoints where operator auth is unavailable.
     */
    @Transactional(readOnly = true)
    public String getDownloadUrlForPlayer(UUID gameId, UUID teamId, UUID resourceId) {
        // One answer for missing, other-game and not-visible: a player must not be able to enumerate ids.
        Resource resource = visibleResources(gameId, teamId).get(resourceId);
        if (resource == null) {
            throw new ForbiddenException("Resource is not available to this team");
        }
        if (resource.getType() != ResourceType.file || resource.getS3Key() == null) {
            throw new BadRequestException("Resource is not a file or has no S3 key");
        }
        if (!objectStorageService.isEnabled()) {
            throw new BadRequestException("Object storage is not configured");
        }
        return objectStorageService.generatePresignedUrl(resource.getS3Key());
    }

    private Map<UUID, Resource> visibleResources(UUID gameId, UUID teamId) {
        Map<UUID, Resource> resources = new LinkedHashMap<>();

        for (Resource r : resourceRepository.findByGameIdAndSharedWithPlayersTrue(gameId)) {
            resources.put(r.getId(), r);
        }

        List<UUID> unlockedBaseIds = checkInRepository.findByGameIdAndTeamId(gameId, teamId).stream()
                .map(c -> c.getBase().getId())
                .distinct()
                .toList();
        List<UUID> unlockedChallengeIds = submissionRepository.findByTeamId(teamId).stream()
                .filter(s -> s.getTeam().getGame().getId().equals(gameId))
                .map(s -> s.getChallenge().getId())
                .distinct()
                .toList();

        Set<UUID> embedIds = new LinkedHashSet<>();
        if (!unlockedBaseIds.isEmpty()) embedIds.addAll(resourceEmbedRepository.findResourceIdsByBaseIdIn(unlockedBaseIds));
        if (!unlockedChallengeIds.isEmpty()) embedIds.addAll(resourceEmbedRepository.findResourceIdsByChallengeIdIn(unlockedChallengeIds));
        embedIds.removeAll(resources.keySet());

        // Embeds can point at organization resources or, after an import, at another
        // organization's files. Only this game's own resources reach players.
        if (!embedIds.isEmpty()) {
            Map<UUID, Resource> loaded = new HashMap<>();
            for (Resource r : resourceRepository.findAllById(embedIds)) {
                if (r.getGame() != null && r.getGame().getId().equals(gameId)) loaded.put(r.getId(), r);
            }
            for (UUID id : embedIds) {
                Resource r = loaded.get(id);
                if (r != null) resources.put(id, r);
            }
        }

        return resources;
    }

    // --- Helpers ---

    private String escapeAttr(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("\"", "&quot;");
    }

    private ResourceResponse toPlayerResponse(Resource r, Map<UUID, Resource> visible) {
        // Player-facing: never expose S3 key or operator content; generate download URL
        String downloadUrl = null;
        if (r.getType() == ResourceType.file && r.getS3Key() != null && objectStorageService.isEnabled()) {
            try {
                downloadUrl = objectStorageService.generatePresignedUrl(r.getS3Key());
            } catch (Exception e) {
                log.warn("[EMBED] Failed presigned URL for resource {}: {}", r.getId(), e.getMessage());
            }
        }
        return new ResourceResponse(
                r.getId(),
                null,
                r.getGame() != null ? r.getGame().getId() : null,
                null,
                r.getType(),
                r.getName(),
                r.getContentType(),
                r.getType() == ResourceType.document ? enrichHtmlForPlayer(r.getContent(), visible) : null,
                r.getSizeBytes(),
                r.getSharedWithPlayers(),
                downloadUrl,
                null,
                null,
                r.getCreatedAt(),
                null
        );
    }
}
