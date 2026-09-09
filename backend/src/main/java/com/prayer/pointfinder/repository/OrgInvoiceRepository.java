package com.prayer.pointfinder.repository;

import com.prayer.pointfinder.entity.OrgInvoice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrgInvoiceRepository extends JpaRepository<OrgInvoice, UUID> {

    Optional<OrgInvoice> findByStripeInvoiceId(String stripeInvoiceId);

    List<OrgInvoice> findByOrganizationIdOrderByCreatedAtDesc(UUID orgId);
}
