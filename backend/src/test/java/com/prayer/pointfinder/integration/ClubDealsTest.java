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

    /** Outbound mail is a side effect, not the thing under test. */
    @MockitoBean private EmailService emailService;

    @MockitoBean private StripeInvoiceGateway stripeGateway;

    private User admin;

    @BeforeEach
    void resetOrgs() {
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

    // ── fixtures ─────────────────────────────────────────────────────

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
