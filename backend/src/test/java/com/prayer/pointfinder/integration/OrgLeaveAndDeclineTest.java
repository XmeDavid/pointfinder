package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.OrgInviteResponse;
import com.prayer.pointfinder.dto.response.OrgResponse;
import com.prayer.pointfinder.entity.InviteStatus;
import com.prayer.pointfinder.entity.OrgInvite;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.OrgInviteRepository;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.service.EmailService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The two ways out of an organization: a member leaves one they are in, and an
 * invitee refuses one they were asked to join.
 */
class OrgLeaveAndDeclineTest extends IntegrationTestBase {

    @Autowired private OrganizationRepository orgRepository;
    @Autowired private OrgMembershipRepository membershipRepository;
    @Autowired private OrgInviteRepository orgInviteRepository;

    /** Outbound mail is a side effect, not the thing under test. */
    @MockitoBean private EmailService emailService;

    @BeforeEach
    void resetOrgs() {
        orgInviteRepository.deleteAll();
        membershipRepository.deleteAll();
        orgRepository.deleteAll();
    }

    private <T> ResponseEntity<T> as(User user, HttpMethod method, String path, Object body, Class<T> type) {
        return restTemplate.exchange(path, method,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), type);
    }

    private User operator(String prefix) {
        return createOperator(prefix + "-" + UUID.randomUUID() + "@test.com", "password");
    }

    /** Creates an org owned by {@code owner} and returns its id. */
    private UUID createOrg(User owner, String name) {
        return createOrgAsAdmin(owner, name);
    }

    /** Creates a club owned by {@code owner} through the admin route and returns its id. */
    private UUID createOrgAsAdmin(User owner, String name) {
        User admin = createAdmin("admin-" + UUID.randomUUID() + "@test.com", "password");
        ResponseEntity<Map> created = as(admin, HttpMethod.POST, "/api/admin/orgs",
                Map.of("name", name, "adminEmail", owner.getEmail()), Map.class);
        assertEquals(HttpStatus.CREATED, created.getStatusCode());
        Map<?, ?> org = (Map<?, ?>) created.getBody().get("org");
        return UUID.fromString((String) org.get("id"));
    }

    /** Invites {@code email} into the org and returns the pending invite id. */
    private UUID invite(User inviter, UUID orgId, String email) {
        ResponseEntity<OrgInviteResponse> invite = as(inviter, HttpMethod.POST,
                "/api/orgs/" + orgId + "/invites", Map.of("email", email), OrgInviteResponse.class);
        assertEquals(HttpStatus.CREATED, invite.getStatusCode());
        return invite.getBody().id();
    }

    // ── leaving ──────────────────────────────────────────────────────

    @Test
    void aMemberWhoIsNotTheCreatorLeavesTheirOwnOrg() {
        User owner = operator("owner");
        User member = operator("member");
        UUID orgId = createOrg(owner, "Leaving Club");

        UUID inviteId = invite(owner, orgId, member.getEmail());
        assertEquals(HttpStatus.OK,
                as(member, HttpMethod.POST, "/api/org-invites/" + inviteId + "/accept", null, String.class)
                        .getStatusCode());
        assertTrue(membershipRepository.existsByOrganizationIdAndUserId(orgId, member.getId()));

        ResponseEntity<Void> left = as(member, HttpMethod.POST, "/api/orgs/" + orgId + "/leave", null, Void.class);
        assertEquals(HttpStatus.NO_CONTENT, left.getStatusCode());
        assertFalse(membershipRepository.existsByOrganizationIdAndUserId(orgId, member.getId()));

        // The org itself and its owner are untouched.
        assertTrue(membershipRepository.existsByOrganizationIdAndUserId(orgId, owner.getId()));
    }

    @Test
    void theCreatorMustTransferOwnershipBeforeLeaving() {
        User owner = operator("owner");
        UUID orgId = createOrg(owner, "Owned Club");

        ResponseEntity<String> refused =
                as(owner, HttpMethod.POST, "/api/orgs/" + orgId + "/leave", null, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("ORG_CREATOR_CANNOT_LEAVE"));
        assertTrue(membershipRepository.existsByOrganizationIdAndUserId(orgId, owner.getId()));
    }

    @Test
    void someoneWhoIsNotAMemberCannotLeave() {
        User owner = operator("owner");
        User stranger = operator("stranger");
        UUID orgId = createOrg(owner, "Closed Club");

        assertEquals(HttpStatus.NOT_FOUND,
                as(stranger, HttpMethod.POST, "/api/orgs/" + orgId + "/leave", null, String.class).getStatusCode());
    }

    // ── declining ────────────────────────────────────────────────────

    @Test
    void theInviteeDeclinesTheirOwnInvite() {
        User owner = operator("owner");
        User invitee = operator("invitee");
        UUID orgId = createOrg(owner, "Declining Club");
        UUID inviteId = invite(owner, orgId, invitee.getEmail());

        ResponseEntity<Void> declined =
                as(invitee, HttpMethod.POST, "/api/org-invites/" + inviteId + "/decline", null, Void.class);
        assertEquals(HttpStatus.NO_CONTENT, declined.getStatusCode());

        OrgInvite reloaded = orgInviteRepository.findById(inviteId).orElseThrow();
        assertEquals(InviteStatus.declined, reloaded.getStatus());
        assertFalse(membershipRepository.existsByOrganizationIdAndUserId(orgId, invitee.getId()));
    }

    @Test
    void theInviteeIsMatchedOnEmailCaseInsensitively() {
        User owner = operator("owner");
        User invitee = operator("MiXeD-Case");
        UUID orgId = createOrg(owner, "Case Club");
        // Invite the same address in a different case than the account carries.
        UUID inviteId = invite(owner, orgId, invitee.getEmail().toUpperCase());

        assertEquals(HttpStatus.NO_CONTENT,
                as(invitee, HttpMethod.POST, "/api/org-invites/" + inviteId + "/decline", null, Void.class)
                        .getStatusCode());
        assertEquals(InviteStatus.declined, orgInviteRepository.findById(inviteId).orElseThrow().getStatus());
    }

    @Test
    void aStrangerCannotDeclineSomeoneElsesInvite() {
        User owner = operator("owner");
        User invitee = operator("invitee");
        User stranger = operator("stranger");
        UUID orgId = createOrg(owner, "Guarded Club");
        UUID inviteId = invite(owner, orgId, invitee.getEmail());

        assertEquals(HttpStatus.FORBIDDEN,
                as(stranger, HttpMethod.POST, "/api/org-invites/" + inviteId + "/decline", null, String.class)
                        .getStatusCode());
        assertEquals(InviteStatus.pending, orgInviteRepository.findById(inviteId).orElseThrow().getStatus());
    }

    @Test
    void anUnknownInviteIsNotFound() {
        User stranger = operator("stranger");
        assertEquals(HttpStatus.NOT_FOUND,
                as(stranger, HttpMethod.POST, "/api/org-invites/" + UUID.randomUUID() + "/decline", null, String.class)
                        .getStatusCode());
    }

    @Test
    void acceptingAfterDecliningIsRefused() {
        User owner = operator("owner");
        User invitee = operator("invitee");
        UUID orgId = createOrg(owner, "One Shot Club");
        UUID inviteId = invite(owner, orgId, invitee.getEmail());

        assertEquals(HttpStatus.NO_CONTENT,
                as(invitee, HttpMethod.POST, "/api/org-invites/" + inviteId + "/decline", null, Void.class)
                        .getStatusCode());

        ResponseEntity<String> accept =
                as(invitee, HttpMethod.POST, "/api/org-invites/" + inviteId + "/accept", null, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, accept.getStatusCode());
        assertFalse(membershipRepository.existsByOrganizationIdAndUserId(orgId, invitee.getId()));
    }

    @Test
    void decliningTwiceIsRefused() {
        User owner = operator("owner");
        User invitee = operator("invitee");
        UUID orgId = createOrg(owner, "Twice Club");
        UUID inviteId = invite(owner, orgId, invitee.getEmail());

        assertEquals(HttpStatus.NO_CONTENT,
                as(invitee, HttpMethod.POST, "/api/org-invites/" + inviteId + "/decline", null, Void.class)
                        .getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST,
                as(invitee, HttpMethod.POST, "/api/org-invites/" + inviteId + "/decline", null, String.class)
                        .getStatusCode());
    }
}
