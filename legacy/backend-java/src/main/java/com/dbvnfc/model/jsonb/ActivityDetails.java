package com.dbvnfc.model.jsonb;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.HashMap;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ActivityDetails implements Serializable {

    private Map<String, Object> details = new HashMap<>();

    public void put(String key, Object value) {
        details.put(key, value);
    }

    public Object get(String key) {
        return details.get(key);
    }
}
