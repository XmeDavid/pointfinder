package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.UpdateResourceRequest;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Organization;
import com.prayer.pointfinder.entity.Resource;
import com.prayer.pointfinder.entity.ResourceType;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.repository.ResourceFolderRepository;
import com.prayer.pointfinder.repository.ResourceRepository;
import com.prayer.pointfinder.websocket.GameEventBroadcaster;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * OW-08: players' document lists follow organizer changes. A change to a
 * game's resources sends the game's content-free configuration refresh signal;
 * clients refetch through their own authorized endpoints.
 */
@ExtendWith(MockitoExtension.class)
class ResourceServiceRealtimeTest {

    @Mock ResourceRepository resourceRepository;
    @Mock ResourceFolderRepository resourceFolderRepository;
    @Mock ObjectStorageService objectStorageService;
    @Mock OrganizationService organizationService;
    @Mock GameAccessService gameAccessService;
    @Mock QuotaService quotaService;
    @Mock GameEventBroadcaster broadcaster;
    @InjectMocks ResourceService resourceService;

    private final User operator = User.builder().id(UUID.randomUUID()).name("Ana").role(UserRole.operator).build();

    @BeforeEach
    void signIn() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(operator, null, List.of()));
    }

    @AfterEach
    void signOut() {
        SecurityContextHolder.clearContext();
    }

    private Resource gameDocument(Game game) {
        return Resource.builder().id(UUID.randomUUID()).game(game).type(ResourceType.document).name("Rules")
                .content("<p>v1</p>").contentType("application/vnd.pointfinder.doc").sizeBytes(9L)
                .sharedWithPlayers(false).createdBy(operator).createdAt(Instant.now()).updatedAt(Instant.now()).build();
    }

    @Test
    void sharingOrEditingAGameDocumentSignalsTheGame() {
        Game game = Game.builder().id(UUID.randomUUID()).build();
        Resource doc = gameDocument(game);
        when(resourceRepository.findById(doc.getId())).thenReturn(Optional.of(doc));
        when(resourceRepository.save(any(Resource.class))).thenAnswer(inv -> inv.getArgument(0));

        UpdateResourceRequest share = new UpdateResourceRequest();
        share.setSharedWithPlayers(true);
        resourceService.updateResource(doc.getId(), share);

        verify(broadcaster).broadcastGameConfig(game.getId(), "resources", "updated");
    }

    @Test
    void deletingAGameResourceSignalsTheGame() {
        Game game = Game.builder().id(UUID.randomUUID()).build();
        Resource doc = gameDocument(game);
        when(resourceRepository.findById(doc.getId())).thenReturn(Optional.of(doc));

        resourceService.deleteResource(doc.getId());

        verify(broadcaster).broadcastGameConfig(game.getId(), "resources", "deleted");
    }

    @Test
    void organizationLibraryChangesStayQuiet() {
        Organization org = Organization.builder().id(UUID.randomUUID()).build();
        Resource doc = gameDocument(null);
        doc.setGame(null);
        doc.setOrganization(org);
        when(resourceRepository.findById(doc.getId())).thenReturn(Optional.of(doc));
        when(resourceRepository.save(any(Resource.class))).thenAnswer(inv -> inv.getArgument(0));

        UpdateResourceRequest rename = new UpdateResourceRequest();
        rename.setName("Club rules");
        resourceService.updateResource(doc.getId(), rename);

        verify(broadcaster, never()).broadcastGameConfig(any(), anyString(), anyString());
    }
}
