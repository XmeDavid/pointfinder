package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.AdminCreateOrgResponse;
import com.prayer.pointfinder.dto.response.InviteTokenResponse;
import com.prayer.pointfinder.dto.response.OrgResponse;
import com.prayer.pointfinder.dto.response.QuotaResponse;
import com.prayer.pointfinder.dto.response.WorkspaceResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.OrgInviteRepository;
import com.prayer.pointfinder.repository.OrgInvoiceRepository;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.repository.StripeEventRepository;
import com.prayer.pointfinder.service.EmailService;
import com.prayer.pointfinder.service.StripeInvoiceGateway;
import com.prayer.pointfinder.service.SubscriptionLifecycleService;
import com.prayer.pointfinder.service.StripeWebhookService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/**
 * End to end behaviour of a sales-led club: an admin creates it, the club
 * administrator gets in (whether or not they already had an account), the term
 * runs out and freezes the club, an invoice reinstates it, and Stripe's
 * redeliveries do not double-apply.
 *
 * <p>Stripe is never called: {@link StripeInvoiceGateway} is the whole SDK
 * boundary and is stubbed here, so these tests need no key and no network.
 */
class ClubDealsTest extends IntegrationTestBase {

    private static final String ADMIN_ORGS = "/api/admin/orgs";

    @Autowired private OrganizationRepository orgRepository;
    @Autowired private OrgMembershipRepository membershipRepository;
    @Autowired private OrgInviteRepository orgInviteRepository;
    @Autowired private OrgInvoiceRepository orgInvoiceRepository;
    @Autowired private StripeEventRepository stripeEventRepository;
    @Autowired private SubscriptionLifecycleService lifecycleService;
    @Autowired private StripeWebhookService webhookService;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private com.prayer.pointfinder.service.QuotaService quotaService;
    @Autowired private com.prayer.pointfinder.service.OrgInviteService orgInviteService;

    /** Outbound mail is a side effect, not the thing under test. */
    @MockitoBean private EmailService emailService;

    @MockitoBean private StripeInvoiceGateway stripeGateway;

    /** Uploads must not need object storage; only the quota decision is under test. */
    @MockitoBean private com.prayer.pointfinder.service.ObjectStorageService objectStorageService;

    @Autowired private com.prayer.pointfinder.repository.ResourceRepository resourceRepository;

    private User admin;

    @BeforeEach
    void resetOrgs() {
        resourceRepository.deleteAll();
        orgInvoiceRepository.deleteAll();
        stripeEventRepository.deleteAll();
        orgInviteRepository.deleteAll();
        membershipRepository.deleteAll();
        orgRepository.deleteAll();
        admin = createAdmin("club-admin-" + UUID.randomUUID() + "@test.com", "password");
    }

    // ── helpers ──────────────────────────────────────────────────────

    private <T> ResponseEntity<T> as(User user, HttpMethod method, String path, Object body, Class<T> type) {
        return restTemplate.exchange(path, method,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), type);
    }

    private Map<String, Object> createBody(String name, String adminEmail) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("adminEmail", adminEmail);
        return body;
    }

    private Organization reload(UUID orgId) {
        return orgRepository.findById(orgId).orElseThrow();
    }

    // ── club creation ────────────────────────────────────────────────

    @Test
    void creatingAClubForAnExistingAccountMakesThatAccountAMemberWithEveryPermission() {
        User clubOwner = createOperator("owner-" + UUID.randomUUID() + "@test.com", "password");

        Map<String, Object> body = createBody("Sporting Test", clubOwner.getEmail());
        body.put("termEnd", "2027-01-01T00:00:00Z");
        body.put("quotaOverrides", Map.of("max_members", 40));
        body.put("adminNote", "Signed at the trade show");

        ResponseEntity<AdminCreateOrgResponse> created =
                as(admin, HttpMethod.POST, ADMIN_ORGS, body, AdminCreateOrgResponse.class);

        assertEquals(HttpStatus.CREATED, created.getStatusCode());
        AdminCreateOrgResponse payload = created.getBody();
        assertNotNull(payload);
        assertEquals(clubOwner.getId(), payload.adminUserId());
        assertNull(payload.inviteId(), "an existing account needs no invite");

        OrgResponse org = payload.org();
        assertEquals("club", org.subscriptionTier());
        assertEquals("active", org.subscriptionStatus());
        assertEquals(Instant.parse("2027-01-01T00:00:00Z"), org.termEnd());
        assertEquals(clubOwner.getId(), org.createdBy());

        OrgMembership membership = membershipRepository
                .findByOrganizationIdAndUserId(org.id(), clubOwner.getId()).orElseThrow();
        assertEquals(OrgPermission.ALL, membership.getPermissions());

        // The deal's override wins over the club default of 15 members.
        ResponseEntity<QuotaResponse> quota = as(clubOwner, HttpMethod.GET,
                "/api/quota/org/" + org.id(), null, QuotaResponse.class);
        assertEquals(HttpStatus.OK, quota.getStatusCode());
        assertEquals(40, quota.getBody().limits().maxMembers());
        assertEquals("club", quota.getBody().tier());
        assertEquals("active", quota.getBody().status());
        assertEquals(Instant.parse("2027-01-01T00:00:00Z"), quota.getBody().termEnd());
    }

    @Test
    void aClubDefaultsToTheStandardDealAndOverridesReplaceOnlyTheKeysTheyName() {
        User clubOwner = createOperator("defaults-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Defaults FC", clubOwner.getEmail()).org().id();

        QuotaResponse.Limits limits = as(clubOwner, HttpMethod.GET,
                "/api/quota/org/" + orgId, null, QuotaResponse.class).getBody().limits();

        assertEquals(15, limits.maxMembers());
        assertEquals(10, limits.maxLiveGames());
        assertEquals(200, limits.maxPlayersPerGame());
        assertNull(limits.maxBasesPerGame(), "a club's bases are unlimited");
        assertNull(limits.maxOperatorsPerGame(), "a club's operators are unlimited");
        assertEquals(2L * 1024 * 1024 * 1024, limits.maxFileSizeBytes());
        assertEquals(25L * 1024 * 1024 * 1024, limits.maxResourceStorageBytes());
        assertTrue(limits.locationCheckIn());
    }

    @Test
    void creatingAClubForAnUnknownAddressInvitesThemAndRegistrationHandsTheClubOver() {
        String email = "newclub-" + UUID.randomUUID() + "@test.com";
        AdminCreateOrgResponse created = createClub("Unknown United", email);

        assertNull(created.adminUserId());
        assertNotNull(created.inviteId());
        assertEquals(admin.getId(), created.org().createdBy(),
                "the creating admin holds the club until the invitee accepts");

        OrgInvite invite = orgInviteRepository.findById(created.inviteId()).orElseThrow();
        assertEquals(OrgPermission.ALL, invite.getDefaultPermissions());
        assertTrue(invite.isTransferOwnership());
        assertEquals(InviteStatus.pending, invite.getStatus());

        // The registration page resolves an org token, which it could not do
        // before: only operator_invites was searched.
        ResponseEntity<InviteTokenResponse> lookup = restTemplate.getForEntity(
                "/api/auth/invite/" + invite.getToken(), InviteTokenResponse.class);
        assertEquals(HttpStatus.OK, lookup.getStatusCode());
        assertEquals(email, lookup.getBody().email());
        assertEquals(created.org().id(), lookup.getBody().orgId());
        assertEquals("Unknown United", lookup.getBody().orgName());

        Map<String, Object> registration = new HashMap<>();
        registration.put("email", email);
        registration.put("name", "New Club Owner");
        registration.put("password", "Str0ng!Passw0rd");

        ResponseEntity<Map> auth = restTemplate.postForEntity(
                "/api/auth/register/" + invite.getToken(), registration, Map.class);
        assertEquals(HttpStatus.OK, auth.getStatusCode());

        User invitee = userRepository.findByEmail(email).orElseThrow();
        OrgMembership membership = membershipRepository
                .findByOrganizationIdAndUserId(created.org().id(), invitee.getId()).orElseThrow();
        assertEquals(OrgPermission.ALL, membership.getPermissions());
        assertEquals(InviteStatus.accepted,
                orgInviteRepository.findById(created.inviteId()).orElseThrow().getStatus());
        assertEquals(invitee.getId(), reload(created.org().id()).getCreatedBy().getId(),
                "accepting the invite transfers the club to the invitee");

        // And the club shows up in the new owner's workspaces straight away.
        ResponseEntity<WorkspaceResponse> workspaces = as(invitee, HttpMethod.GET,
                "/api/workspaces", null, WorkspaceResponse.class);
        assertEquals(1, workspaces.getBody().organizations().size());
        assertEquals("club", workspaces.getBody().organizations().get(0).tier());
    }

    // ── tier migration ───────────────────────────────────────────────

    @Test
    void theTierEnumHasCollapsedToFreeAndClubAndNoRowIsLeftOnTheRetiredLabels() {
        assertArrayEquals(new OrgTier[] { OrgTier.free, OrgTier.club }, OrgTier.values());

        Integer stale = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM organizations WHERE subscription_tier IN ('base', 'high')",
                Integer.class);
        assertEquals(0, stale, "V65 migrated every base/high org to club");

        // The retired labels survive in the Postgres type — dropping an enum
        // value would mean rewriting the type and every column using it — but
        // nothing writes them any more.
        List<String> labels = jdbcTemplate.queryForList(
                "SELECT unnest(enum_range(NULL::org_tier))::text", String.class);
        assertTrue(labels.contains("club"));
        assertTrue(labels.contains("free"));
    }

    // ── term, grace, freeze ──────────────────────────────────────────

    @Test
    void aTermThatHasRunOutStartsGraceSevenDaysFromTheTermItselfAndThenFreezes() {
        User owner = createOperator("term-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Lapsing Rovers", owner.getEmail()).org().id();

        // Postgres timestamptz keeps microseconds; comparing raw nanos would
        // fail on the round trip rather than on the behaviour under test.
        Instant termEnd = Instant.now().minus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
        Organization org = reload(orgId);
        org.setTermEnd(termEnd);
        orgRepository.save(org);

        lifecycleService.startGracePeriodsForExpiredTerms();

        org = reload(orgId);
        assertEquals(SubscriptionStatus.grace_period, org.getSubscriptionStatus());
        assertEquals(termEnd.plus(7, ChronoUnit.DAYS), org.getGracePeriodEnd(),
                "grace runs from the term's end, not from when the sweep happened");

        // Still inside grace: the freeze sweep leaves it alone.
        lifecycleService.freezeExpiredGracePeriods();
        assertEquals(SubscriptionStatus.grace_period, reload(orgId).getSubscriptionStatus());

        // A term that lapsed more than a week ago goes all the way through in
        // one sweep, which is why the scheduled job runs both in order.
        org = reload(orgId);
        org.setSubscriptionStatus(SubscriptionStatus.active);
        org.setGracePeriodEnd(null);
        org.setTermEnd(Instant.now().minus(30, ChronoUnit.DAYS));
        orgRepository.save(org);

        lifecycleService.sweepExpiredTermsAndGracePeriods();
        assertEquals(SubscriptionStatus.frozen, reload(orgId).getSubscriptionStatus());
    }

    @Test
    void aClubWithNoTermIsNeverSweptIntoGrace() {
        User owner = createOperator("noterm-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Manual FC", owner.getEmail()).org().id();
        assertNull(reload(orgId).getTermEnd());

        lifecycleService.sweepExpiredTermsAndGracePeriods();

        assertEquals(SubscriptionStatus.active, reload(orgId).getSubscriptionStatus());
    }

    // ── the frozen gate ──────────────────────────────────────────────

    @Test
    void aFrozenClubBlocksItsOwnRequestsWhileThePersonalWorkspaceKeepsWorking() {
        User owner = createOperator("frozen-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Frozen Athletic", owner.getEmail()).org().id();

        Game personalGame = createGame(owner, "A personal game", GameStatus.setup);
        Game clubGame = createGame(owner, "A club game", GameStatus.setup);
        clubGame.setOrganization(reload(orgId));
        gameRepository.save(clubGame);

        // Everything works while the club is active.
        assertEquals(HttpStatus.OK,
                as(owner, HttpMethod.GET, "/api/orgs/" + orgId + "/members", null, String.class).getStatusCode());
        assertEquals(HttpStatus.OK,
                as(owner, HttpMethod.GET, "/api/games/" + clubGame.getId(), null, String.class).getStatusCode());

        Organization org = reload(orgId);
        org.setSubscriptionStatus(SubscriptionStatus.frozen);
        orgRepository.save(org);

        assertEquals(HttpStatus.FORBIDDEN,
                as(owner, HttpMethod.GET, "/api/orgs/" + orgId + "/members", null, String.class).getStatusCode(),
                "acting inside a frozen club is blocked");
        assertEquals(HttpStatus.FORBIDDEN,
                as(owner, HttpMethod.GET, "/api/games/" + clubGame.getId(), null, String.class).getStatusCode(),
                "a game owned by a frozen club is blocked too");

        assertEquals(HttpStatus.OK,
                as(owner, HttpMethod.GET, "/api/games/" + personalGame.getId(), null, String.class).getStatusCode(),
                "the member's own personal workspace is a separate subscription");
        assertEquals(HttpStatus.OK,
                as(owner, HttpMethod.GET, "/api/workspaces", null, String.class).getStatusCode(),
                "the workspace read stays reachable so the club can see why it is frozen");
    }

    // ── invoicing ────────────────────────────────────────────────────

    @Test
    void issuingAnInvoiceRecordsItAndPayingItExtendsTheTermAndReactivatesTheClub() {
        User owner = createOperator("invoice-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Billing Wanderers", owner.getEmail()).org().id();

        stubStripeInvoice("in_test_extend");

        Map<String, Object> invoiceBody = new HashMap<>();
        invoiceBody.put("amountCents", 49900);
        invoiceBody.put("description", "PointFinder club, one season");
        invoiceBody.put("termMonths", 12);

        ResponseEntity<Map> issued = as(admin, HttpMethod.POST,
                ADMIN_ORGS + "/" + orgId + "/invoices", invoiceBody, Map.class);
        assertEquals(HttpStatus.CREATED, issued.getStatusCode());
        assertEquals("in_test_extend", issued.getBody().get("stripeInvoiceId"));
        assertEquals("eur", issued.getBody().get("currency"));

        OrgInvoice stored = orgInvoiceRepository.findByStripeInvoiceId("in_test_extend").orElseThrow();
        assertEquals(49900L, stored.getAmountCents());
        assertEquals(12, stored.getTermMonths());
        assertEquals(admin.getId(), stored.getCreatedBy().getId());
        assertEquals("cus_test", reload(orgId).getStripeCustomerId());

        // The club lapsed before the payment landed.
        Organization org = reload(orgId);
        org.setSubscriptionStatus(SubscriptionStatus.frozen);
        org.setGracePeriodEnd(Instant.now().minus(1, ChronoUnit.DAYS));
        org.setTermEnd(Instant.now().minus(10, ChronoUnit.DAYS));
        orgRepository.save(org);

        Instant before = Instant.now();
        webhookService.handleInvoicePaid(stripeInvoice("in_test_extend"));

        org = reload(orgId);
        assertEquals(SubscriptionStatus.active, org.getSubscriptionStatus());
        assertNull(org.getGracePeriodEnd());
        assertTrue(org.getTermEnd().isAfter(before.plus(360, ChronoUnit.DAYS)),
                "a lapsed term is measured from now, not backdated: " + org.getTermEnd());
        assertEquals("paid", orgInvoiceRepository.findByStripeInvoiceId("in_test_extend")
                .orElseThrow().getStatus());
    }

    @Test
    void renewingEarlyAddsToTheRunningTermInsteadOfTruncatingIt() {
        User owner = createOperator("renew-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Early Renewal FC", owner.getEmail()).org().id();

        Instant runningTerm = Instant.now().plus(90, ChronoUnit.DAYS);
        Organization org = reload(orgId);
        org.setTermEnd(runningTerm);
        orgRepository.save(org);

        stubStripeInvoice("in_test_early");
        Map<String, Object> body = new HashMap<>();
        body.put("amountCents", 49900);
        body.put("description", "Next season");
        body.put("termMonths", 12);
        as(admin, HttpMethod.POST, ADMIN_ORGS + "/" + orgId + "/invoices", body, Map.class);

        webhookService.handleInvoicePaid(stripeInvoice("in_test_early"));

        assertTrue(reload(orgId).getTermEnd().isAfter(runningTerm.plus(360, ChronoUnit.DAYS)),
                "the new term starts where the old one ended");
    }

    @Test
    void aMemberWithBillingPermissionCanReadTheClubsInvoicesAndOthersCannot() {
        User owner = createOperator("billing-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Readable Rangers", owner.getEmail()).org().id();

        stubStripeInvoice("in_test_read");
        Map<String, Object> body = new HashMap<>();
        body.put("amountCents", 1000);
        body.put("description", "Season");
        as(admin, HttpMethod.POST, ADMIN_ORGS + "/" + orgId + "/invoices", body, Map.class);

        ResponseEntity<List> mine = as(owner, HttpMethod.GET,
                "/api/orgs/" + orgId + "/invoices", null, List.class);
        assertEquals(HttpStatus.OK, mine.getStatusCode());
        assertEquals(1, mine.getBody().size());

        User outsider = createOperator("outsider-" + UUID.randomUUID() + "@test.com", "password");
        assertEquals(HttpStatus.FORBIDDEN, as(outsider, HttpMethod.GET,
                "/api/orgs/" + orgId + "/invoices", null, String.class).getStatusCode());
    }

    @Test
    void invoicingWithoutAStripeKeyFailsWithAClearCodeRatherThanAStripeStackTrace() {
        User owner = createOperator("nokey-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Unconfigured City", owner.getEmail()).org().id();

        when(stripeGateway.isConfigured()).thenReturn(false);

        Map<String, Object> body = new HashMap<>();
        body.put("amountCents", 1000);
        body.put("description", "Season");
        ResponseEntity<String> response = as(admin, HttpMethod.POST,
                ADMIN_ORGS + "/" + orgId + "/invoices", body, String.class);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(response.getBody().contains("INVOICE_STRIPE_NOT_CONFIGURED"));
    }

    // ── webhook idempotency ──────────────────────────────────────────

    @Test
    void theSameStripeEventDeliveredTwiceHasTheEffectOfOne() {
        User owner = createOperator("idem-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Redelivery Town", owner.getEmail()).org().id();

        stubStripeInvoice("in_test_idem");
        Map<String, Object> body = new HashMap<>();
        body.put("amountCents", 49900);
        body.put("description", "Season");
        body.put("termMonths", 12);
        as(admin, HttpMethod.POST, ADMIN_ORGS + "/" + orgId + "/invoices", body, Map.class);

        boolean firstApplied = webhookService.applyOnce("evt_test_idem", "invoice.paid",
                () -> webhookService.handleInvoicePaid(stripeInvoice("in_test_idem")));
        Instant afterFirst = reload(orgId).getTermEnd();

        boolean secondApplied = webhookService.applyOnce("evt_test_idem", "invoice.paid",
                () -> webhookService.handleInvoicePaid(stripeInvoice("in_test_idem")));

        assertTrue(firstApplied);
        assertFalse(secondApplied, "a redelivery is recognised and skipped");
        assertEquals(afterFirst, reload(orgId).getTermEnd(),
                "the term is extended once, not twice");
        assertEquals(1, stripeEventRepository.count());
    }

    @Test
    void aVoidedInvoiceIsRecordedAndLeavesTheTermAlone() {
        User owner = createOperator("void-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Void Vale", owner.getEmail()).org().id();

        stubStripeInvoice("in_test_void");
        Map<String, Object> body = new HashMap<>();
        body.put("amountCents", 1000);
        body.put("description", "Season");
        as(admin, HttpMethod.POST, ADMIN_ORGS + "/" + orgId + "/invoices", body, Map.class);

        webhookService.handleInvoiceClosed(stripeInvoice("in_test_void"), "void");

        assertEquals("void", orgInvoiceRepository.findByStripeInvoiceId("in_test_void")
                .orElseThrow().getStatus());
        assertNull(reload(orgId).getTermEnd());
    }

    // ── ownership and validation ─────────────────────────────────────

    @Test
    void ownershipMovesToAnExistingMemberAndIsRefusedForAnyoneElse() {
        User owner = createOperator("first-" + UUID.randomUUID() + "@test.com", "password");
        User successor = createOperator("second-" + UUID.randomUUID() + "@test.com", "password");
        User stranger = createOperator("stranger-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Succession FC", owner.getEmail()).org().id();

        membershipRepository.save(OrgMembership.builder()
                .organization(reload(orgId))
                .user(successor)
                .permissions(OrgPermission.OPERATE_GAMES.getBit())
                .build());

        ResponseEntity<String> refused = as(admin, HttpMethod.POST,
                ADMIN_ORGS + "/" + orgId + "/transfer-ownership",
                Map.of("userId", stranger.getId().toString()), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("ORG_TRANSFER_TARGET_NOT_MEMBER"));

        ResponseEntity<OrgResponse> transferred = as(admin, HttpMethod.POST,
                ADMIN_ORGS + "/" + orgId + "/transfer-ownership",
                Map.of("userId", successor.getId().toString()), OrgResponse.class);
        assertEquals(HttpStatus.OK, transferred.getStatusCode());
        assertEquals(successor.getId(), transferred.getBody().createdBy());
        assertEquals(OrgPermission.ALL, membershipRepository
                .findByOrganizationIdAndUserId(orgId, successor.getId()).orElseThrow().getPermissions());
    }

    @Test
    void theClubsOwnCreatorCanHandItOverWithoutAPlatformAdmin() {
        User owner = createOperator("selfhand-" + UUID.randomUUID() + "@test.com", "password");
        User successor = createOperator("successor-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Self Service FC", owner.getEmail()).org().id();

        membershipRepository.save(OrgMembership.builder()
                .organization(reload(orgId))
                .user(successor)
                .permissions(OrgPermission.OPERATE_GAMES.getBit())
                .build());

        ResponseEntity<OrgResponse> transferred = as(owner, HttpMethod.POST,
                "/api/orgs/" + orgId + "/transfer-ownership",
                Map.of("userId", successor.getId().toString()), OrgResponse.class);

        assertEquals(HttpStatus.OK, transferred.getStatusCode());
        assertEquals(successor.getId(), reload(orgId).getCreatedBy().getId());

        // And a plain member may not.
        User plain = createOperator("plain-" + UUID.randomUUID() + "@test.com", "password");
        membershipRepository.save(OrgMembership.builder()
                .organization(reload(orgId))
                .user(plain)
                .permissions(OrgPermission.OPERATE_GAMES.getBit())
                .build());
        assertEquals(HttpStatus.FORBIDDEN, as(plain, HttpMethod.POST,
                "/api/orgs/" + orgId + "/transfer-ownership",
                Map.of("userId", plain.getId().toString()), String.class).getStatusCode());
    }

    @Test
    void patchingAClubValidatesEnumsAndAppliesTheFieldsItIsGiven() {
        User owner = createOperator("patch-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Patchable Park", owner.getEmail()).org().id();

        ResponseEntity<String> badTier = as(admin, HttpMethod.PATCH,
                ADMIN_ORGS + "/" + orgId, Map.of("tier", "high"), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, badTier.getStatusCode(),
                "a retired tier name is the admin's typo, not a server fault");
        assertTrue(badTier.getBody().contains("ORG_INVALID_ENUM_VALUE"));

        ResponseEntity<String> badStatus = as(admin, HttpMethod.PATCH,
                ADMIN_ORGS + "/" + orgId, Map.of("status", "suspended"), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, badStatus.getStatusCode());
        assertTrue(badStatus.getBody().contains("ORG_INVALID_ENUM_VALUE"));

        Map<String, Object> patch = new HashMap<>();
        patch.put("name", "Renamed Park");
        patch.put("tier", "free");
        patch.put("status", "grace_period");
        patch.put("termEnd", "2030-06-30T00:00:00Z");
        patch.put("quotaOverrides", Map.of("max_live_games", 3));
        patch.put("adminNote", "Downgraded after the season");

        ResponseEntity<OrgResponse> patched =
                as(admin, HttpMethod.PATCH, ADMIN_ORGS + "/" + orgId, patch, OrgResponse.class);
        assertEquals(HttpStatus.OK, patched.getStatusCode());
        assertEquals("Renamed Park", patched.getBody().name());
        assertEquals("free", patched.getBody().subscriptionTier());
        assertEquals("grace_period", patched.getBody().subscriptionStatus());
        assertEquals(Instant.parse("2030-06-30T00:00:00Z"), patched.getBody().termEnd());
    }

    @Test
    void theAdminTreeIsClosedToOperators() {
        User operator = createOperator("nosy-" + UUID.randomUUID() + "@test.com", "password");
        long orgsBefore = orgRepository.count();

        ResponseEntity<String> denied = as(operator, HttpMethod.POST, ADMIN_ORGS,
                createBody("Not Yours FC", operator.getEmail()), String.class);

        // The filter chain denies it, and the servlet's ERROR dispatch — which
        // this app's stateless chain re-runs with an empty security context —
        // turns the 403 into the entry point's 401 by the time it reaches a
        // real client. Either way it never reaches the controller, which is
        // the property under test; asserting on the empty org table says that
        // without pinning the app's existing denial-status behaviour.
        assertTrue(denied.getStatusCode().is4xxClientError(), "operators are refused: " + denied.getStatusCode());
        assertEquals(orgsBefore, orgRepository.count(), "no club was created");

        ResponseEntity<String> patch = as(operator, HttpMethod.PATCH,
                ADMIN_ORGS + "/" + UUID.randomUUID(), Map.of("name", "Nope"), String.class);
        assertTrue(patch.getStatusCode().is4xxClientError());
    }

    // ── what a frozen club may still do ──────────────────────────────

    @Test
    void aFrozenClubCanStillReachItsInvoiceAndLetAMemberWalkOut() {
        User owner = createOperator("carve-owner-" + UUID.randomUUID() + "@test.com", "password");
        User member = createOperator("carve-member-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Trapped Town", owner.getEmail()).org().id();

        membershipRepository.save(OrgMembership.builder()
                .organization(reload(orgId))
                .user(member)
                .permissions(OrgPermission.ALL)
                .build());

        stubStripeInvoice("in_test_frozen_read");
        Map<String, Object> invoiceBody = new HashMap<>();
        invoiceBody.put("amountCents", 49900);
        invoiceBody.put("description", "Season");
        as(admin, HttpMethod.POST, ADMIN_ORGS + "/" + orgId + "/invoices", invoiceBody, Map.class);

        Organization org = reload(orgId);
        org.setSubscriptionStatus(SubscriptionStatus.frozen);
        orgRepository.save(org);

        // The bill that unfreezes the club is readable while it is frozen.
        ResponseEntity<List> invoices = as(owner, HttpMethod.GET,
                "/api/orgs/" + orgId + "/invoices", null, List.class);
        assertEquals(HttpStatus.OK, invoices.getStatusCode(),
                "a frozen club must be able to reach the invoice it has to pay");
        assertEquals(1, invoices.getBody().size());

        // And a member is not locked inside it.
        assertEquals(HttpStatus.NO_CONTENT, as(member, HttpMethod.POST,
                "/api/orgs/" + orgId + "/leave", null, String.class).getStatusCode(),
                "freezing a club must not trap the people in it");
        assertFalse(membershipRepository
                .findByOrganizationIdAndUserId(orgId, member.getId()).isPresent());

        // Everything else inside the org stays refused.
        ResponseEntity<String> members = as(owner, HttpMethod.GET,
                "/api/orgs/" + orgId + "/members", null, String.class);
        assertEquals(HttpStatus.FORBIDDEN, members.getStatusCode());
        assertTrue(members.getBody().contains("ACCOUNT_FROZEN"));

        assertEquals(HttpStatus.FORBIDDEN, as(owner, HttpMethod.POST,
                "/api/orgs/" + orgId + "/invites",
                Map.of("email", "nobody-" + UUID.randomUUID() + "@test.com"), String.class)
                .getStatusCode(), "the carve-out is per method as well as per path");
    }

    // ── invite expiry ────────────────────────────────────────────────

    @Test
    void anInviteIsBornWithADeadlineAndIsRefusedEverywhereOnceItHasPassed() {
        String email = "expiring-" + UUID.randomUUID() + "@test.com";
        AdminCreateOrgResponse created = createClub("Expiring Athletic", email);

        OrgInvite invite = orgInviteRepository.findById(created.inviteId()).orElseThrow();
        assertNotNull(invite.getExpiresAt(), "every new invite carries a deadline");
        assertTrue(invite.getExpiresAt().isAfter(Instant.now().plus(13, ChronoUnit.DAYS)));
        assertTrue(invite.getExpiresAt().isBefore(Instant.now().plus(15, ChronoUnit.DAYS)));

        invite.setExpiresAt(Instant.now().minus(1, ChronoUnit.DAYS));
        orgInviteRepository.saveAndFlush(invite);

        // The registration page's token lookup refuses it.
        ResponseEntity<String> lookup = restTemplate.getForEntity(
                "/api/auth/invite/" + invite.getToken(), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, lookup.getStatusCode());

        // So does registering through it.
        Map<String, Object> registration = new HashMap<>();
        registration.put("email", email);
        registration.put("name", "Too Late");
        registration.put("password", "Str0ng!Passw0rd");
        ResponseEntity<String> register = restTemplate.postForEntity(
                "/api/auth/register/" + invite.getToken(), registration, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, register.getStatusCode());
        assertTrue(userRepository.findByEmailIgnoreCase(email).isEmpty(),
                "an expired token creates no account");

        // And so does accepting it as a signed-in account with that address.
        User late = createOperator(email, "password");
        ResponseEntity<String> accept = as(late, HttpMethod.POST,
                "/api/org-invites/" + invite.getId() + "/accept", null, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, accept.getStatusCode());
        assertFalse(membershipRepository
                .existsByOrganizationIdAndUserId(created.org().id(), late.getId()));
    }

    @Test
    void theSweepMovesPendingInvitesPastTheirDeadlineToExpired() {
        String stale = "stale-" + UUID.randomUUID() + "@test.com";
        String fresh = "fresh-" + UUID.randomUUID() + "@test.com";
        UUID staleId = createClub("Stale Rovers", stale).inviteId();
        UUID freshId = createClub("Fresh Rovers", fresh).inviteId();

        OrgInvite expiring = orgInviteRepository.findById(staleId).orElseThrow();
        expiring.setExpiresAt(Instant.now().minus(1, ChronoUnit.HOURS));
        orgInviteRepository.saveAndFlush(expiring);

        // The sweep owns the label; a refused accept only refuses, because the
        // exception it throws would roll a status write back anyway.
        assertEquals(1, orgInviteService.expirePendingInvites());

        assertEquals(InviteStatus.expired,
                orgInviteRepository.findById(staleId).orElseThrow().getStatus());
        assertEquals(InviteStatus.pending,
                orgInviteRepository.findById(freshId).orElseThrow().getStatus(),
                "an invite still inside its window is untouched");
    }

    // ── quota overrides that are not numbers ─────────────────────────

    @Test
    void anOverrideTypedAsAStringDegradesToTheDefaultInsteadOfBreakingTheClub() {
        User owner = createOperator("typo-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Typo Town", owner.getEmail()).org().id();

        // A row written before validation existed, or by hand.
        Organization org = reload(orgId);
        Map<String, Object> overrides = new HashMap<>();
        overrides.put("max_members", "40");
        overrides.put("max_resource_storage_bytes", "not a number");
        org.setQuotaOverrides(overrides);
        orgRepository.saveAndFlush(org);

        ResponseEntity<QuotaResponse> quota = as(owner, HttpMethod.GET,
                "/api/quota/org/" + orgId, null, QuotaResponse.class);
        assertEquals(HttpStatus.OK, quota.getStatusCode(),
                "a mistyped override must not 500 the whole club");
        assertEquals(40, quota.getBody().limits().maxMembers(), "a numeric string is read as its number");
        assertEquals(25L * 1024 * 1024 * 1024, quota.getBody().limits().maxResourceStorageBytes(),
                "anything else falls back to the club default");
    }

    @Test
    void theAdminWritePathsRefuseAnOverrideWhoseValueIsTheWrongType() {
        User owner = createOperator("valid-" + UUID.randomUUID() + "@test.com", "password");

        Map<String, Object> body = createBody("Bad Deal FC", owner.getEmail());
        body.put("quotaOverrides", Map.of("max_members", "40"));
        ResponseEntity<String> created = as(admin, HttpMethod.POST, ADMIN_ORGS, body, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, created.getStatusCode());
        assertTrue(created.getBody().contains("ORG_INVALID_QUOTA_OVERRIDE"), created.getBody());

        UUID orgId = createClub("Good Deal FC", owner.getEmail()).org().id();
        Map<String, Object> patch = new HashMap<>();
        patch.put("quotaOverrides", Map.of("location_check_in", "yes"));
        ResponseEntity<String> patched = as(admin, HttpMethod.PATCH,
                ADMIN_ORGS + "/" + orgId, patch, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, patched.getStatusCode());
        assertTrue(patched.getBody().contains("ORG_INVALID_QUOTA_OVERRIDE"), patched.getBody());

        // Null and the right type are both fine, and an unknown per-deal key
        // passes through: the product does not own every key in that map.
        Map<String, Object> good = new HashMap<>();
        Map<String, Object> goodOverrides = new HashMap<>();
        goodOverrides.put("max_members", 40);
        goodOverrides.put("max_bases_per_game", null);
        goodOverrides.put("location_check_in", true);
        goodOverrides.put("some_future_key", "whatever");
        good.put("quotaOverrides", goodOverrides);
        assertEquals(HttpStatus.OK,
                as(admin, HttpMethod.PATCH, ADMIN_ORGS + "/" + orgId, good, OrgResponse.class)
                        .getStatusCode());
    }

    // ── clearing a field ─────────────────────────────────────────────

    @Test
    void anAdminCanClearTheTermEndGracePeriodAndNoteBecauseNullMeansClear() {
        User owner = createOperator("clear-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Clearable City", owner.getEmail()).org().id();

        Organization org = reload(orgId);
        org.setTermEnd(Instant.parse("2030-01-01T00:00:00Z"));
        org.setGracePeriodEnd(Instant.parse("2030-01-08T00:00:00Z"));
        org.setAdminNote("Agreed by phone");
        orgRepository.saveAndFlush(org);

        // A patch that names none of them leaves all three alone.
        as(admin, HttpMethod.PATCH, ADMIN_ORGS + "/" + orgId, Map.of("name", "Still Clearable"),
                OrgResponse.class);
        org = reload(orgId);
        assertNotNull(org.getTermEnd(), "an absent key changes nothing");
        assertNotNull(org.getGracePeriodEnd());
        assertEquals("Agreed by phone", org.getAdminNote());

        // A patch that sends null for each clears it — which is the only way
        // an admin screen can take a term back off a club.
        Map<String, Object> clearing = new HashMap<>();
        clearing.put("termEnd", null);
        clearing.put("gracePeriodEnd", null);
        clearing.put("adminNote", null);
        ResponseEntity<OrgResponse> cleared =
                as(admin, HttpMethod.PATCH, ADMIN_ORGS + "/" + orgId, clearing, OrgResponse.class);
        assertEquals(HttpStatus.OK, cleared.getStatusCode());
        assertNull(cleared.getBody().termEnd());

        org = reload(orgId);
        assertNull(org.getTermEnd());
        assertNull(org.getGracePeriodEnd());
        assertNull(org.getAdminNote());
    }

    // ── email case ───────────────────────────────────────────────────

    @Test
    void aClubCreatedForAMixedCaseAddressAttachesTheAccountThatAlreadyExists() {
        String stored = "coach-" + UUID.randomUUID() + "@club.pt";
        User coach = createOperator(stored, "password");

        AdminCreateOrgResponse created =
                createClub("Case FC", stored.toUpperCase(java.util.Locale.ROOT));

        assertEquals(coach.getId(), created.adminUserId(),
                "the account is found whatever case the admin typed");
        assertNull(created.inviteId(), "no unacceptable invite is minted");
        assertEquals(stored, created.adminEmail(), "the address is stored in lower case");
        assertEquals(coach.getId(), created.org().createdBy());
        assertTrue(membershipRepository
                .findByOrganizationIdAndUserId(created.org().id(), coach.getId()).isPresent());
    }

    @Test
    void anOwnerInviteMintedForAMixedCaseAddressStillReachesItsInviteeList() {
        String email = "mixed-" + UUID.randomUUID() + "@club.pt";
        AdminCreateOrgResponse created = createClub("Mixed Case FC", email.toUpperCase(java.util.Locale.ROOT));
        assertNotNull(created.inviteId());

        // The invitee registers later, in the case they prefer.
        User invitee = createOperator(email, "password");
        ResponseEntity<List> mine = as(invitee, HttpMethod.GET, "/api/org-invites/my", null, List.class);
        assertEquals(HttpStatus.OK, mine.getStatusCode());
        assertEquals(1, mine.getBody().size(), "the invite reaches the address it was sent to");
    }

    // ── past due terms ───────────────────────────────────────────────

    @Test
    void aPastDueClubWhoseTermLapsedStillReachesGraceAndThenFreezes() {
        User owner = createOperator("pastdue-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Past Due Palace", owner.getEmail()).org().id();

        Instant termEnd = Instant.now().minus(30, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
        Organization org = reload(orgId);
        org.setSubscriptionStatus(SubscriptionStatus.past_due);
        org.setTermEnd(termEnd);
        orgRepository.saveAndFlush(org);

        lifecycleService.sweepExpiredTermsAndGracePeriods();

        assertEquals(SubscriptionStatus.frozen, reload(orgId).getSubscriptionStatus(),
                "a club whose payment failed must still freeze when its term runs out");
    }

    // ── a payment whose local row never landed ───────────────────────

    @Test
    void aPaidInvoiceWithNoLocalRowIsRecoveredFromTheStripeMetadata() {
        User owner = createOperator("lostrow-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Lost Row Rangers", owner.getEmail()).org().id();

        // Stripe sent and collected the invoice; the commit that would have
        // written org_invoices failed, so nothing here knows about it.
        Organization org = reload(orgId);
        org.setSubscriptionStatus(SubscriptionStatus.frozen);
        org.setStripeCustomerId("cus_test");
        org.setTermEnd(Instant.now().minus(10, ChronoUnit.DAYS));
        orgRepository.saveAndFlush(org);
        assertTrue(orgInvoiceRepository.findByStripeInvoiceId("in_test_lost").isEmpty());

        com.stripe.model.Invoice paid = stripeInvoice("in_test_lost");
        paid.setMetadata(Map.of("orgId", orgId.toString(), "termMonths", "12"));
        paid.setAmountPaid(49900L);
        paid.setCurrency("eur");

        Instant before = Instant.now();
        webhookService.handleInvoicePaid(paid);

        org = reload(orgId);
        assertEquals(SubscriptionStatus.active, org.getSubscriptionStatus());
        assertTrue(org.getTermEnd().isAfter(before.plus(360, ChronoUnit.DAYS)),
                "the term the club paid for is granted, not silently dropped: " + org.getTermEnd());

        OrgInvoice recovered = orgInvoiceRepository.findByStripeInvoiceId("in_test_lost").orElseThrow();
        assertEquals("paid", recovered.getStatus());
        assertEquals(12, recovered.getTermMonths());
        assertEquals(49900L, recovered.getAmountCents());
        assertEquals(orgId, recovered.getOrganization().getId());
    }

    @Test
    void aPersonalInvoiceWithNoOrgMetadataStillTakesThePersonalPath() {
        com.stripe.model.Invoice paid = stripeInvoice("in_test_personal");
        paid.setMetadata(Map.of());

        // No org names this customer, so nothing club-shaped is created.
        webhookService.handleInvoicePaid(paid);

        assertTrue(orgInvoiceRepository.findByStripeInvoiceId("in_test_personal").isEmpty());
    }

    // ── who may hand a club over ─────────────────────────────────────

    @Test
    void aMemberWithManagePermsCannotMakeThemselvesTheOwner() {
        User owner = createOperator("keeps-" + UUID.randomUUID() + "@test.com", "password");
        User manager = createOperator("manager-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Held Tight FC", owner.getEmail()).org().id();

        membershipRepository.save(OrgMembership.builder()
                .organization(reload(orgId))
                .user(manager)
                .permissions(OrgPermission.MANAGE_PERMS.getBit() | OrgPermission.OPERATE_GAMES.getBit())
                .build());

        ResponseEntity<String> grab = as(manager, HttpMethod.POST,
                "/api/orgs/" + orgId + "/transfer-ownership",
                Map.of("userId", manager.getId().toString()), String.class);

        assertEquals(HttpStatus.FORBIDDEN, grab.getStatusCode(),
                "editing permissions is not the same as taking the club");
        assertEquals(owner.getId(), reload(orgId).getCreatedBy().getId());

        // The platform admin route is unaffected.
        assertEquals(HttpStatus.OK, as(admin, HttpMethod.POST,
                ADMIN_ORGS + "/" + orgId + "/transfer-ownership",
                Map.of("userId", manager.getId().toString()), OrgResponse.class).getStatusCode());
        assertEquals(manager.getId(), reload(orgId).getCreatedBy().getId());
    }

    // ── unlimited storage ────────────────────────────────────────────

    @Test
    void aClubWhoseDealSaysUnlimitedStorageUploadsPastTheTwentyFiveGigabyteDefault() {
        User owner = createOperator("storage-" + UUID.randomUUID() + "@test.com", "password");
        UUID orgId = createClub("Unlimited United", owner.getEmail()).org().id();

        when(objectStorageService.isEnabled()).thenReturn(true);

        // The club is already well past the club default, without one byte of
        // this test's own being written: the row states the usage.
        Organization org = reload(orgId);
        resourceRepository.save(com.prayer.pointfinder.entity.Resource.builder()
                .organization(org)
                .type(com.prayer.pointfinder.entity.ResourceType.file)
                .name("The season archive")
                .contentType("application/octet-stream")
                .s3Key("resources/seed")
                .sizeBytes(30L * 1024 * 1024 * 1024)
                .createdBy(owner)
                .build());

        // With the club default of 25 GB, the next upload is refused.
        ResponseEntity<String> refused = uploadOrgResource(owner, orgId, "Over the default");
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("QUOTA_RESOURCE_STORAGE_EXCEEDED"), refused.getBody());

        // The deal says unlimited, which the override map spells as an
        // explicit null — the same spelling the file-size limit already read
        // that way, and the same one the admin form sends.
        Map<String, Object> unlimited = new HashMap<>();
        unlimited.put("max_resource_storage_bytes", null);
        org = reload(orgId);
        org.setQuotaOverrides(unlimited);
        orgRepository.saveAndFlush(org);

        assertNull(quotaService.getMaxResourceStorageBytes(reload(orgId)),
                "null means unlimited, not 'no override'");

        ResponseEntity<String> allowed = uploadOrgResource(owner, orgId, "Past the default");
        assertEquals(HttpStatus.CREATED, allowed.getStatusCode(), allowed.getBody());
    }

    // ── fixtures ─────────────────────────────────────────────────────

    /** One small file into the club's resource library, through the real endpoint. */
    private ResponseEntity<String> uploadOrgResource(User user, UUID orgId, String name) {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("name", name);
        metadata.put("type", "file");

        org.springframework.http.HttpHeaders metadataHeaders = new org.springframework.http.HttpHeaders();
        metadataHeaders.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);

        org.springframework.util.MultiValueMap<String, Object> parts =
                new org.springframework.util.LinkedMultiValueMap<>();
        parts.add("metadata", new HttpEntity<>(metadata, metadataHeaders));
        org.springframework.http.HttpHeaders fileHeaders = new org.springframework.http.HttpHeaders();
        fileHeaders.setContentType(org.springframework.http.MediaType.TEXT_PLAIN);
        parts.add("file", new HttpEntity<>(
                new org.springframework.core.io.ByteArrayResource("hello".getBytes()) {
                    @Override
                    public String getFilename() {
                        return "hello.txt";
                    }
                }, fileHeaders));

        org.springframework.http.HttpHeaders headers = headersWithAuth(operatorAuthHeader(user));
        headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);

        return restTemplate.exchange("/api/orgs/" + orgId + "/resources", HttpMethod.POST,
                new HttpEntity<>(parts, headers), String.class);
    }

    private AdminCreateOrgResponse createClub(String name, String adminEmail) {
        ResponseEntity<AdminCreateOrgResponse> created = as(admin, HttpMethod.POST, ADMIN_ORGS,
                createBody(name, adminEmail), AdminCreateOrgResponse.class);
        assertEquals(HttpStatus.CREATED, created.getStatusCode());
        return created.getBody();
    }

    private void stubStripeInvoice(String invoiceId) {
        when(stripeGateway.isConfigured()).thenReturn(true);
        when(stripeGateway.ensureCustomer(ArgumentMatchers.any(), ArgumentMatchers.anyString(),
                ArgumentMatchers.anyString(), ArgumentMatchers.any())).thenReturn("cus_test");
        when(stripeGateway.issueInvoice(ArgumentMatchers.any())).thenReturn(
                new StripeInvoiceGateway.IssuedInvoice(
                        invoiceId, "open",
                        "https://invoice.stripe.test/" + invoiceId,
                        "https://invoice.stripe.test/" + invoiceId + ".pdf",
                        Instant.now().plus(30, ChronoUnit.DAYS)));
    }

    private com.stripe.model.Invoice stripeInvoice(String id) {
        com.stripe.model.Invoice invoice = new com.stripe.model.Invoice();
        invoice.setId(id);
        invoice.setCustomer("cus_test");
        return invoice;
    }
}
