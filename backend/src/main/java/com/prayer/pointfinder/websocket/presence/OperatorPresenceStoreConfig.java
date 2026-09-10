package com.prayer.pointfinder.websocket.presence;

import com.prayer.pointfinder.config.HaProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Slf4j
@Configuration
public class OperatorPresenceStoreConfig {

    @Bean
    public OperatorPresenceStore operatorPresenceStore(HaProperties haProperties,
                                                       JdbcTemplate jdbcTemplate,
                                                       PlatformTransactionManager transactionManager) {
        if ("memory".equalsIgnoreCase(haProperties.getPresence().getStore())) {
            log.warn("[HA] operator presence uses the per-process memory store; not shared across instances");
            return new InMemoryOperatorPresenceStore();
        }
        return new JdbcOperatorPresenceStore(jdbcTemplate, transactionManager);
    }
}
