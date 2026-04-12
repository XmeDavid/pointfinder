package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.ResourceEmbed;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ResourceEmbedRepository extends JpaRepository<ResourceEmbed, UUID> {
    List<ResourceEmbed> findByBaseId(UUID baseId);
    List<ResourceEmbed> findByChallengeId(UUID challengeId);
    List<ResourceEmbed> findByResourceId(UUID resourceId);

    @Modifying
    @Query("DELETE FROM ResourceEmbed re WHERE re.base.id = :baseId")
    void deleteByBaseId(@Param("baseId") UUID baseId);

    @Modifying
    @Query("DELETE FROM ResourceEmbed re WHERE re.challenge.id = :challengeId")
    void deleteByChallengeId(@Param("challengeId") UUID challengeId);

    @Query("SELECT re.resource.id FROM ResourceEmbed re WHERE re.base.id IN :baseIds")
    List<UUID> findResourceIdsByBaseIdIn(@Param("baseIds") List<UUID> baseIds);

    @Query("SELECT re.resource.id FROM ResourceEmbed re WHERE re.challenge.id IN :challengeIds")
    List<UUID> findResourceIdsByChallengeIdIn(@Param("challengeIds") List<UUID> challengeIds);
}
