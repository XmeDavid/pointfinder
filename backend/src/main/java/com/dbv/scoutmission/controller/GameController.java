package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.CreateGameRequest;
import com.dbv.scoutmission.dto.request.UpdateGameRequest;
import com.dbv.scoutmission.dto.request.UpdateGameStatusRequest;
import com.dbv.scoutmission.dto.response.GameResponse;
import com.dbv.scoutmission.service.GameService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/games")
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;

    @GetMapping
    public ResponseEntity<List<GameResponse>> getAllGames() {
        return ResponseEntity.ok(gameService.getAllGames());
    }

    @GetMapping("/{id}")
    public ResponseEntity<GameResponse> getGame(@PathVariable UUID id) {
        return ResponseEntity.ok(gameService.getGame(id));
    }

    @PostMapping
    public ResponseEntity<GameResponse> createGame(@Valid @RequestBody CreateGameRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(gameService.createGame(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GameResponse> updateGame(@PathVariable UUID id,
                                                    @Valid @RequestBody UpdateGameRequest request) {
        return ResponseEntity.ok(gameService.updateGame(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteGame(@PathVariable UUID id) {
        gameService.deleteGame(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<GameResponse> updateStatus(@PathVariable UUID id,
                                                      @Valid @RequestBody UpdateGameStatusRequest request) {
        return ResponseEntity.ok(gameService.updateStatus(id, request.getStatus()));
    }

    @PostMapping("/{id}/operators/{userId}")
    public ResponseEntity<Void> addOperator(@PathVariable UUID id, @PathVariable UUID userId) {
        gameService.addOperator(id, userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}/operators/{userId}")
    public ResponseEntity<Void> removeOperator(@PathVariable UUID id, @PathVariable UUID userId) {
        gameService.removeOperator(id, userId);
        return ResponseEntity.noContent().build();
    }
}
