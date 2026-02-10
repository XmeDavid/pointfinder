package com.dbv.scoutmission.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "app.apns")
public class ApnsConfig {

    private boolean enabled = false;
    private String keyPath;
    private String keyId;
    private String teamId;
    private String bundleId;
    private boolean production = false;
}
