package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.ResourceResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.BaseRepository;
import com.prayer.pointfinder.repository.ChallengeRepository;
import com.prayer.pointfinder.repository.ResourceEmbedRepository;
import com.prayer.pointfinder.repository.ResourceRepository;
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
     * Enriches HTML by replacing data-resource-id placeholders with download URLs
     * and metadata data-attributes so players can render embedded resources.
     */
    public String enrichHtmlForPlayer(String html) {
        if (html == null || html.isBlank()) return html;

        StringBuffer result = new StringBuffer();
        Matcher matcher = RESOURCE_ID_PATTERN.matcher(html);

        while (matcher.find()) {
            String uuidStr = matcher.group(1);
            String replacement = matcher.group(0); // default: leave as-is
            try {
                UUID resourceId = UUID.fromString(uuidStr);
                Optional<Resource> opt = resourceRepository.findById(resourceId);
                if (opt.isPresent()) {
                    Resource r = opt.get();
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
                            log.warn("[EMBED] Failed to generate presigned URL for resource {}: {}", resourceId, e.getMessage());
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
     * Aggregates player-visible resources for a game: shared resources plus
     * resources embedded in unlocked bases and challenges.
     */
    @Transactional(readOnly = true)
    public List<ResourceResponse> getPlayerVisibleResources(UUID gameId,
                                                             List<UUID> unlockedBaseIds,
                                                             List<UUID> unlockedChallengeIds) {
        Map<UUID, Resource> resources = new LinkedHashMap<>();

        // Shared resources
        for (Resource r : resourceRepository.findByGameIdAndSharedWithPlayersTrue(gameId)) {
            resources.put(r.getId(), r);
        }

        // Embedded in unlocked bases
        if (unlockedBaseIds != null && !unlockedBaseIds.isEmpty()) {
            List<UUID> embedIds = resourceEmbedRepository.findResourceIdsByBaseIdIn(unlockedBaseIds);
            for (UUID id : embedIds) {
                resourceRepository.findById(id).ifPresent(r -> resources.put(r.getId(), r));
            }
        }

        // Embedded in unlocked challenges
        if (unlockedChallengeIds != null && !unlockedChallengeIds.isEmpty()) {
            List<UUID> embedIds = resourceEmbedRepository.findResourceIdsByChallengeIdIn(unlockedChallengeIds);
            for (UUID id : embedIds) {
                resourceRepository.findById(id).ifPresent(r -> resources.put(r.getId(), r));
            }
        }

        return resources.values().stream().map(this::toPlayerResponse).toList();
    }

    // --- Helpers ---

    private String escapeAttr(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("\"", "&quot;");
    }

    private ResourceResponse toPlayerResponse(Resource r) {
        // Player-facing: never expose S3 key or operator content; generate download URL
        String downloadUrl = null;
        if (r.getType() == ResourceType.file && r.getS3Key() != null && objectStorageService.isEnabled()) {
            try {
                downloadUrl = objectStorageService.generatePresignedUrl(r.getS3Key());
            } catch (Exception e) {
                log.warn("[EMBED] Failed presigned URL for resource {}: {}", r.getId(), e.getMessage());
            }
        }
        return ResourceResponse.builder()
                .id(r.getId())
                .gameId(r.getGame() != null ? r.getGame().getId() : null)
                .type(r.getType())
                .name(r.getName())
                .contentType(r.getContentType())
                .content(r.getType() == ResourceType.document ? r.getContent() : null)
                .sizeBytes(r.getSizeBytes())
                .sharedWithPlayers(r.getSharedWithPlayers())
                .downloadUrl(downloadUrl)
                .createdAt(r.getCreatedAt())
                .build();
    }
}
