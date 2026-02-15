package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    List<User> findByRole(UserRole role);

    @Query("""
            SELECT DISTINCT u
            FROM Game g
            JOIN g.operators u
            WHERE g.id = :gameId
              AND u.pushToken IS NOT NULL
            """)
    List<User> findGameOperatorsWithPushToken(@Param("gameId") UUID gameId);
}
