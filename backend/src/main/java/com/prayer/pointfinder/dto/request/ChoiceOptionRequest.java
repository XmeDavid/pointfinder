package com.prayer.pointfinder.dto.request;

import lombok.Data;

/** OW-34: an option of a choice challenge as the operator edits it. A missing id gets one on save. */
@Data
public class ChoiceOptionRequest {
    private String id;
    private String text;
    private boolean correct;
}
