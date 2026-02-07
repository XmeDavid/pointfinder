package com.dbvnfc.model.jsonb;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Enigma implements Serializable {

    private String id;

    private String title;

    private String content;

    private String answer;

    @JsonProperty("answerTemplate")
    private String answerTemplate;

    private Integer points;

    @JsonProperty("baseId")
    private String baseId;

    @JsonProperty("isLocationDependent")
    private Boolean isLocationDependent;

    @JsonProperty("mediaType")
    private String mediaType;

    @JsonProperty("mediaUrl")
    private String mediaUrl;
}
