package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.CreateBaseRequest;
import com.dbv.scoutmission.dto.request.UpdateBaseRequest;
import com.dbv.scoutmission.dto.response.BaseResponse;
import com.dbv.scoutmission.service.BaseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/games/{gameId}/bases")
@RequiredArgsConstructor
public class BaseController {

    private final BaseService baseService;

    @GetMapping
    public ResponseEntity<List<BaseResponse>> getBases(@PathVariable UUID gameId) {
        return ResponseEntity.ok(baseService.getBasesByGame(gameId));
    }

    @PostMapping
    public ResponseEntity<BaseResponse> createBase(@PathVariable UUID gameId,
                                                    @Valid @RequestBody CreateBaseRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(baseService.createBase(gameId, request));
    }

    @PutMapping("/{baseId}")
    public ResponseEntity<BaseResponse> updateBase(@PathVariable UUID gameId,
                                                    @PathVariable UUID baseId,
                                                    @Valid @RequestBody UpdateBaseRequest request) {
        return ResponseEntity.ok(baseService.updateBase(gameId, baseId, request));
    }

    @DeleteMapping("/{baseId}")
    public ResponseEntity<Void> deleteBase(@PathVariable UUID gameId, @PathVariable UUID baseId) {
        baseService.deleteBase(gameId, baseId);
        return ResponseEntity.noContent().build();
    }
}
