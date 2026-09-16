package com.prayer.pointfinder.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * OW-34: one option of a choice challenge, stored as JSON on the challenge.
 * {@code id} is stable across edits so submissions keep pointing at the
 * option that was chosen; {@code correct} is the answer key and is only ever
 * serialized on operator DTOs.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChoiceOption {
    private String id;
    private String text;
    private boolean correct;
}
