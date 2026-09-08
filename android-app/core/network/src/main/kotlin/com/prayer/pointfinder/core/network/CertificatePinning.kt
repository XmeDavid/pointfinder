package com.prayer.pointfinder.core.network

import okhttp3.CertificatePinner

/**
 * OkHttp certificate pinning for the PointFinder API domain.
 *
 * Pin rotation strategy:
 * These pins target the ISRG Root X1 and ISRG Root X2 root CA certificates
 * (Let's Encrypt). Root CA pins are stable for years (typically 15-25 year
 * lifetimes), unlike leaf or intermediate certificate pins which rotate
 * every 90 days with Let's Encrypt.
 *
 * - ISRG Root X1: RSA root, valid until 2035. Primary pin.
 * - ISRG Root X2: ECDSA root, valid until 2035. Backup pin.
 *
 * When a root CA is approaching end-of-life or Let's Encrypt announces a
 * new root, add the new root's SPKI hash as an additional pin in an app
 * update BEFORE removing the old one. Always maintain at least two pins
 * to avoid bricking clients if one CA is retired unexpectedly.
 *
 * Audit finding: 12.2 — enforce certificate pinning on all HTTP clients.
 */
object CertificatePinning {

    val pinner: CertificatePinner = CertificatePinner.Builder()
        // ISRG Root X1 (Let's Encrypt RSA root CA)
        .add("pointfinder.pt", "sha256/C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=")
        // ISRG Root X2 (Let's Encrypt ECDSA root CA) — backup pin
        .add("pointfinder.pt", "sha256/diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=")
        .build()
}
