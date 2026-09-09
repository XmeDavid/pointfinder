package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.request.CreateOrgInvoiceRequest;
import com.prayer.pointfinder.dto.response.OrgInvoiceResponse;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.OrgInviteRepository;
import com.prayer.pointfinder.repository.OrgInvoiceRepository;
import com.prayer.pointfinder.repository.OrgMembershipRepository;
import com.prayer.pointfinder.repository.OrganizationRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Club invoicing: issuing an invoice through Stripe and listing what a club
 * has been billed. Payment does not land here — Stripe reports it as
 * {@code invoice.paid} and {@link StripeWebhookService} applies it.
 *
 * <p>There is no admin audit table in this schema (the V36 audit foundation is
 * game-scoped: check-ins, submissions, activity events), so invoice issuance
 * and admin quota changes are recorded as {@code [CLUB_BILLING]} and
 * {@code [ADMIN]} log lines that name the acting admin and the target org.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrgInvoiceService {

    private static final int MAX_DUE_DAYS = 365;
    private static final int MAX_TERM_MONTHS = 60;
    /** €1,000,000 in cents — a typo guard, not a business ceiling. */
    private static final long MAX_AMOUNT_CENTS = 100_000_000L;

    private final OrganizationRepository orgRepository;
    private final OrgInvoiceRepository invoiceRepository;
    private final OrgMembershipRepository membershipRepository;
    private final OrgInviteRepository orgInviteRepository;
    private final OrganizationService organizationService;
    private final StripeInvoiceGateway stripeGateway;

    @Transactional
    public OrgInvoiceResponse issueInvoice(UUID orgId, CreateOrgInvoiceRequest request) {
        if (!stripeGateway.isConfigured()) {
            throw new BadRequestException(
                "Invoicing needs STRIPE_SECRET_KEY to be configured.",
                ErrorCode.INVOICE_STRIPE_NOT_CONFIGURED);
        }

        Organization org = orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));

        long amountCents = request.getAmountCents();
        int dueDays = request.getDueDays() != null ? request.getDueDays() : 30;
        int termMonths = request.getTermMonths() != null ? request.getTermMonths() : 12;
        String currency = normalizeCurrency(request.getCurrency());

        if (amountCents > MAX_AMOUNT_CENTS || dueDays > MAX_DUE_DAYS || termMonths > MAX_TERM_MONTHS) {
            throw new BadRequestException(
                "amountCents must be at most " + MAX_AMOUNT_CENTS + ", dueDays at most " + MAX_DUE_DAYS
                    + ", and termMonths at most " + MAX_TERM_MONTHS + ".",
                ErrorCode.INVOICE_AMOUNT_INVALID);
        }

        String billingEmail = resolveBillingEmail(org);
        String customerId = stripeGateway.ensureCustomer(
            org.getStripeCustomerId(), billingEmail, org.getName(), orgId);
        if (!customerId.equals(org.getStripeCustomerId())) {
            org.setStripeCustomerId(customerId);
            orgRepository.save(org);
        }

        StripeInvoiceGateway.IssuedInvoice issued = stripeGateway.issueInvoice(
            new StripeInvoiceGateway.IssueInvoiceCommand(
                customerId, orgId, amountCents, currency, request.getDescription(), dueDays, termMonths));

        User actor = SecurityUtils.getCurrentUser();
        OrgInvoice invoice = OrgInvoice.builder()
            .organization(org)
            .stripeInvoiceId(issued.id())
            .amountCents(amountCents)
            .currency(currency)
            .description(request.getDescription())
            .status(issued.status() != null ? issued.status() : "open")
            .hostedInvoiceUrl(issued.hostedInvoiceUrl())
            .invoicePdf(issued.invoicePdf())
            .dueAt(issued.dueAt())
            .termMonths(termMonths)
            .createdBy(actor)
            .build();
        invoice = invoiceRepository.save(invoice);

        log.info("[CLUB_BILLING] operation=issueInvoice actor={} orgId={} invoiceId={} stripeInvoiceId={} "
                + "amountCents={} currency={} termMonths={} dueDays={}",
            actor.getId(), orgId, invoice.getId(), issued.id(), amountCents, currency, termMonths, dueDays);

        return toResponse(invoice);
    }

    /** Admin view: every invoice ever issued for the club. */
    @Transactional(readOnly = true)
    public List<OrgInvoiceResponse> listInvoicesForAdmin(UUID orgId) {
        orgRepository.findById(orgId)
            .orElseThrow(() -> new ResourceNotFoundException("Organization", orgId));
        return invoiceRepository.findByOrganizationIdOrderByCreatedAtDesc(orgId).stream()
            .map(this::toResponse)
            .toList();
    }

    /** Member view: the same list, gated on MANAGE_BILLING. */
    @Transactional(readOnly = true)
    public List<OrgInvoiceResponse> listInvoicesForMember(UUID orgId) {
        organizationService.ensureCurrentUserHasPermission(orgId, OrgPermission.MANAGE_BILLING);
        return listInvoicesForAdmin(orgId);
    }

    /**
     * Who receives the invoice email: the club's own creator when they are a
     * member, otherwise the longest-standing member holding MANAGE_BILLING,
     * otherwise the pending admin invite's address. A club created for an email
     * that has not registered yet is billed at that address.
     */
    private String resolveBillingEmail(Organization org) {
        List<OrgMembership> memberships = membershipRepository.findByOrganizationId(org.getId());

        UUID creatorId = org.getCreatedBy().getId();
        return memberships.stream()
            .filter(m -> m.getUser().getId().equals(creatorId))
            .map(m -> m.getUser().getEmail())
            .findFirst()
            .or(() -> memberships.stream()
                .filter(m -> m.hasPermission(OrgPermission.MANAGE_BILLING))
                .min(Comparator.comparing(OrgMembership::getJoinedAt))
                .map(m -> m.getUser().getEmail()))
            .or(() -> orgInviteRepository
                .findByOrganizationIdAndStatus(org.getId(), InviteStatus.pending).stream()
                .filter(OrgInvite::isTransferOwnership)
                .map(OrgInvite::getEmail)
                .findFirst())
            .orElseThrow(() -> new BadRequestException(
                "This organization has no billing contact to invoice.",
                ErrorCode.INVOICE_NO_BILLING_CONTACT));
    }

    private String normalizeCurrency(String currency) {
        if (currency == null || currency.isBlank()) return "eur";
        return currency.trim().toLowerCase();
    }

    OrgInvoiceResponse toResponse(OrgInvoice invoice) {
        return new OrgInvoiceResponse(
            invoice.getId(),
            invoice.getOrganization().getId(),
            invoice.getStripeInvoiceId(),
            invoice.getAmountCents(),
            invoice.getCurrency(),
            invoice.getDescription(),
            invoice.getStatus(),
            invoice.getHostedInvoiceUrl(),
            invoice.getInvoicePdf(),
            invoice.getDueAt(),
            invoice.getPaidAt(),
            invoice.getTermMonths(),
            invoice.getCreatedAt());
    }
}
