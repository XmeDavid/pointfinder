package com.prayer.pointfinder;

import org.junit.jupiter.api.extension.ConditionEvaluationResult;
import org.junit.jupiter.api.extension.ExecutionCondition;
import org.junit.jupiter.api.extension.ExtensionContext;

/**
 * JUnit 5 condition that disables tests when Docker is not available.
 * Used to gracefully skip Testcontainers-based integration tests
 * when Docker Desktop is incompatible or not running.
 */
public class DockerAvailableCondition implements ExecutionCondition {

    @Override
    public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {
        try {
            org.testcontainers.DockerClientFactory.instance().client();
            return ConditionEvaluationResult.enabled("Docker is available");
        } catch (Exception e) {
            return ConditionEvaluationResult.disabled(
                    "Docker is not available: " + e.getMessage());
        }
    }
}
