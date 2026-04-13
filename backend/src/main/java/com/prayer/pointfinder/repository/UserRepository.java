package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    @Query("SELECT u FROM User u WHERE LOWER(u.name) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(u.email) LIKE LOWER(CONCAT('%', :search, '%'))")
    Page<User> searchByNameOrEmail(@Param("search") String search, Pageable pageable);

    @Query("""
            SELECT DISTINCT u
            FROM Game g
            JOIN g.operators u
            WHERE g.id = :gameId
              AND u.pushToken IS NOT NULL
            """)
    List<User> findGameOperatorsWithPushToken(@Param("gameId") UUID gameId);
}
