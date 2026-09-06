package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.export.GameExportDto;
import com.prayer.pointfinder.dto.request.CreateGameRequest;
import com.prayer.pointfinder.dto.request.GameImportRequest;
import com.prayer.pointfinder.dto.request.UpdateGameRequest;
import com.prayer.pointfinder.dto.request.UpdateGameStatusRequest;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.dto.response.UserResponse;
import com.prayer.pointfinder.service.GameImportExportService;
import com.prayer.pointfinder.service.GameService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
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
    private final GameImportExportService gameImportExportService;

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
        return ResponseEntity.ok(gameService.updateStatus(id, request.getStatus(), request.isResetProgress()));
    }

    @PostMapping("/{id}/operators/{userId}")
    public ResponseEntity<Void> addOperator(@PathVariable UUID id, @PathVariable UUID userId) {
        gameService.addOperator(id, userId);
        // Audit 1.14: POST creating an association should return 201 Created, not 204.
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @DeleteMapping("/{id}/operators/{userId}")
    public ResponseEntity<Void> removeOperator(@PathVariable UUID id, @PathVariable UUID userId) {
        gameService.removeOperator(id, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/operators")
    public ResponseEntity<List<UserResponse>> listOperators(@PathVariable UUID id) {
        return ResponseEntity.ok(gameService.getGameOperators(id));
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<GameExportDto> exportGame(@PathVariable UUID id) {
        GameExportDto export = gameImportExportService.exportGame(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"game-" + id + ".json\"")
                .body(export);
    }

    @PostMapping("/import")
    public ResponseEntity<GameResponse> importGame(@Valid @RequestBody GameImportRequest request) {
        GameResponse game = gameImportExportService.importGame(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(game);
    }
}
