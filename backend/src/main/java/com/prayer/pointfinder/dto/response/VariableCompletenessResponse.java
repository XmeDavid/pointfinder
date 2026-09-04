package com.prayer.pointfinder.dto.response;

import java.util.List;

public record VariableCompletenessResponse(boolean complete, List<String> errors) {}
