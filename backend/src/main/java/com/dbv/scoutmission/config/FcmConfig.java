package com.dbv.scoutmission.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "app.fcm")
public class FcmConfig {
    private boolean enabled = false;
    private String credentialsPath;
    private String projectId;
}
