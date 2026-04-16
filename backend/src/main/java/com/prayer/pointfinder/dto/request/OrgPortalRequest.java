package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code POST /api/billing/org-portal}. Typed DTO replaces
 * the previous untyped {@code Map<String, String>} so that Jackson and Jakarta
 * Bean Validation catch malformed input (missing or blank orgId) before the
 * service layer tries to parse a UUID and crashes with a 500.
 */
public record OrgPortalRequest(@NotBlank String orgId) {}
