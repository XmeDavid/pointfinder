package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.GameTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GameTagRepository extends JpaRepository<GameTag, UUID> {

    List<GameTag> findByGameIdOrderByCreatedAtAsc(UUID gameId);

    Optional<GameTag> findByGameIdAndLabelIgnoreCase(UUID gameId, String label);

    long countByGameId(UUID gameId);

    /**
     * Returns {@code true} if the tag is referenced by at least one row in
     * {@code base_tags} or {@code challenge_tags}. Used by
     * {@link com.prayer.pointfinder.service.GameTagService#deleteTag} to enforce
     * the CRITICAL-1 guard: we detect in-use assignments atomically within the
     * same transaction before the DELETE, so the ON DELETE CASCADE on the join
     * tables cannot silently remove live assignments.
     *
     * <p>The native query bypasses the JPA entity graph for the join tables
     * (which are not modelled as entities) and remains correct regardless of
     * the Hibernate first-level cache state.
     */
    @Query(value = """
            SELECT EXISTS (
                SELECT 1 FROM base_tags      WHERE tag_id = :tagId
                UNION ALL
                SELECT 1 FROM challenge_tags WHERE tag_id = :tagId
            )
            """, nativeQuery = true)
    boolean existsByTagIdInUse(@Param("tagId") UUID tagId);
}
