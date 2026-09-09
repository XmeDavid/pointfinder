package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.StripeEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StripeEventRepository extends JpaRepository<StripeEvent, String> {
}
