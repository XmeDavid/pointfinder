package com.dbvnfc.model.jsonb;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Base implements Serializable {

    private String id;

    private String name;

    private String description;

    private Double latitude;

    private Double longitude;

    @JsonProperty("nfcLinked")
    private Boolean nfcLinked;

    @JsonProperty("nfcTagUuid")
    private String nfcTagUuid;

    @JsonProperty("isLocationDependent")
    private Boolean isLocationDependent;

    @JsonProperty("enigmaId")
    private String enigmaId;
}
