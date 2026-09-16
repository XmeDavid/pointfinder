package com.prayer.pointfinder.dto.response;

/** Player view of a choice option: id and text only. The answer key is structurally absent. */
public record PlayerChoiceOptionResponse(String id, String text) {}
