package com.prayer.pointfinder.service.ratelimit;

import com.prayer.pointfinder.config.HaProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Slf4j
@Configuration
public class RateLimitStoreConfig {

    @Bean
    public RateLimitStore rateLimitStore(HaProperties haProperties,
                                         JdbcTemplate jdbcTemplate,
                                         PlatformTransactionManager transactionManager) {
        if ("memory".equalsIgnoreCase(haProperties.getRateLimit().getStore())) {
            log.warn("[HA] rate limits use the per-process memory store; not safe with more than one instance");
            return new InMemoryRateLimitStore();
        }
        return new JdbcRateLimitStore(jdbcTemplate, transactionManager);
    }
}
