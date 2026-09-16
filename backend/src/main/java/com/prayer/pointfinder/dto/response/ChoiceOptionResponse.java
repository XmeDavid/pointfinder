package com.prayer.pointfinder.dto.response;

/** Operator view of a choice option, answer key included. */
public record ChoiceOptionResponse(String id, String text, boolean correct) {}
