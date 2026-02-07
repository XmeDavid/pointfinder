package com.dbv.scoutmission.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS is handled at the Spring Security filter level via SecurityConfig.
 * This class is intentionally empty – kept as a placeholder for any future
 * MVC-level web configuration.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {
}
