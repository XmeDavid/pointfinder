package com.prayer.pointfinder.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CreateBaseRequest;
import com.prayer.pointfinder.dto.request.UpdateBaseRequest;
import com.prayer.pointfinder.dto.response.BaseResponse;
import com.prayer.pointfinder.exception.GlobalExceptionHandler;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.security.JwtAuthenticationFilter;
import com.prayer.pointfinder.service.BaseService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BaseController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class BaseControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private BaseService baseService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    private static final UUID GAME_ID = UUID.randomUUID();
    private static final UUID BASE_ID = UUID.randomUUID();

    // ── GET /api/games/{gameId}/bases ─────────────────────────────────

    @Test
    void getBasesReturns200WithList() throws Exception {
        BaseResponse base = BaseResponse.builder()
                .id(BASE_ID)
                .gameId(GAME_ID)
                .name("Base Alpha")
                .description("First base")
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(false)
                .hidden(false)
                .build();

        when(baseService.getBasesByGame(GAME_ID)).thenReturn(List.of(base));

        mockMvc.perform(get("/api/games/" + GAME_ID + "/bases"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(BASE_ID.toString()))
                .andExpect(jsonPath("$[0].name").value("Base Alpha"))
                .andExpect(jsonPath("$[0].lat").value(47.3769));
    }

    @Test
    void getBasesReturnsEmptyList() throws Exception {
        when(baseService.getBasesByGame(GAME_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/games/" + GAME_ID + "/bases"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ── POST /api/games/{gameId}/bases ────────────────────────────────

    @Test
    void createBaseWithValidBodyReturns201() throws Exception {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName("Base Alpha");
        request.setDescription("First base");
        request.setLat(47.3769);
        request.setLng(8.5417);

        BaseResponse response = BaseResponse.builder()
                .id(BASE_ID)
                .gameId(GAME_ID)
                .name("Base Alpha")
                .description("First base")
                .lat(47.3769)
                .lng(8.5417)
                .nfcLinked(false)
                .hidden(false)
                .build();

        when(baseService.createBase(eq(GAME_ID), any(CreateBaseRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/bases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(BASE_ID.toString()))
                .andExpect(jsonPath("$.name").value("Base Alpha"))
                .andExpect(jsonPath("$.lat").value(47.3769))
                .andExpect(jsonPath("$.lng").value(8.5417));
    }

    @Test
    void createBaseWithMissingNameReturns400() throws Exception {
        CreateBaseRequest request = new CreateBaseRequest();
        // name not set - @NotBlank should reject
        request.setLat(47.3769);
        request.setLng(8.5417);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/bases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists());
    }

    @Test
    void createBaseWithMissingLatReturns400() throws Exception {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName("Base Alpha");
        // lat not set - @NotNull should reject
        request.setLng(8.5417);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/bases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.lat").exists());
    }

    @Test
    void createBaseWithInvalidLatReturns400() throws Exception {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName("Base Alpha");
        request.setLat(91.0); // exceeds max of 90
        request.setLng(8.5417);

        mockMvc.perform(post("/api/games/" + GAME_ID + "/bases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.lat").exists());
    }

    @Test
    void createBaseWithInvalidLngReturns400() throws Exception {
        CreateBaseRequest request = new CreateBaseRequest();
        request.setName("Base Alpha");
        request.setLat(47.0);
        request.setLng(181.0); // exceeds max of 180

        mockMvc.perform(post("/api/games/" + GAME_ID + "/bases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.lng").exists());
    }

    // ── PUT /api/games/{gameId}/bases/{baseId} ────────────────────────

    @Test
    void updateBaseWithValidBodyReturns200() throws Exception {
        UpdateBaseRequest request = new UpdateBaseRequest();
        request.setName("Updated Base");
        request.setDescription("Updated desc");
        request.setLat(48.0);
        request.setLng(9.0);

        BaseResponse response = BaseResponse.builder()
                .id(BASE_ID)
                .gameId(GAME_ID)
                .name("Updated Base")
                .description("Updated desc")
                .lat(48.0)
                .lng(9.0)
                .nfcLinked(false)
                .hidden(false)
                .build();

        when(baseService.updateBase(eq(GAME_ID), eq(BASE_ID), any(UpdateBaseRequest.class))).thenReturn(response);

        mockMvc.perform(put("/api/games/" + GAME_ID + "/bases/" + BASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated Base"))
                .andExpect(jsonPath("$.lat").value(48.0));
    }

    @Test
    void updateBaseNotFoundReturns404() throws Exception {
        UpdateBaseRequest request = new UpdateBaseRequest();
        request.setName("Updated Base");
        request.setLat(48.0);
        request.setLng(9.0);

        when(baseService.updateBase(eq(GAME_ID), eq(BASE_ID), any(UpdateBaseRequest.class)))
                .thenThrow(new ResourceNotFoundException("Base", BASE_ID));

        mockMvc.perform(put("/api/games/" + GAME_ID + "/bases/" + BASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").exists());
    }

    // ── PATCH /api/games/{gameId}/bases/{baseId}/nfc-link ─────────────

    @Test
    void linkNfcReturns200() throws Exception {
        BaseResponse response = BaseResponse.builder()
                .id(BASE_ID)
                .gameId(GAME_ID)
                .name("Base Alpha")
                .lat(47.0)
                .lng(8.0)
                .nfcLinked(true)
                .hidden(false)
                .build();

        when(baseService.setNfcLinked(GAME_ID, BASE_ID, true)).thenReturn(response);

        mockMvc.perform(patch("/api/games/" + GAME_ID + "/bases/" + BASE_ID + "/nfc-link"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nfcLinked").value(true));
    }

    @Test
    void linkNfcNotFoundReturns404() throws Exception {
        when(baseService.setNfcLinked(GAME_ID, BASE_ID, true))
                .thenThrow(new ResourceNotFoundException("Base", BASE_ID));

        mockMvc.perform(patch("/api/games/" + GAME_ID + "/bases/" + BASE_ID + "/nfc-link"))
                .andExpect(status().isNotFound());
    }

    // ── DELETE /api/games/{gameId}/bases/{baseId} ─────────────────────

    @Test
    void deleteBaseReturns204() throws Exception {
        doNothing().when(baseService).deleteBase(GAME_ID, BASE_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/bases/" + BASE_ID))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteBaseNotFoundReturns404() throws Exception {
        doThrow(new ResourceNotFoundException("Base", BASE_ID))
                .when(baseService).deleteBase(GAME_ID, BASE_ID);

        mockMvc.perform(delete("/api/games/" + GAME_ID + "/bases/" + BASE_ID))
                .andExpect(status().isNotFound());
    }
}
