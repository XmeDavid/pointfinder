package com.prayer.pointfinder

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for the dashboard deep-link detector used by [MainActivity].
 *
 * Pure JVM test — no Robolectric. [MainActivity.DeepLinkRouter] accepts
 * host/path strings directly so we avoid depending on `android.net.Uri`
 * which would require a device-backed harness.
 */
class DeepLinkRouterTest {

    @Test
    fun `dashboard path on pointfinder_pt is recognized`() {
        assertTrue(
            MainActivity.DeepLinkRouter.isDashboardDeepLink(
                host = "pointfinder.pt",
                path = "/dashboard",
            ),
        )
    }

    @Test
    fun `dashboard path on pointfinder_ch is recognized`() {
        assertTrue(
            MainActivity.DeepLinkRouter.isDashboardDeepLink(
                host = "pointfinder.ch",
                path = "/dashboard",
            ),
        )
    }

    @Test
    fun `host is case insensitive`() {
        assertTrue(
            MainActivity.DeepLinkRouter.isDashboardDeepLink(
                host = "POINTFINDER.PT",
                path = "/dashboard",
            ),
        )
    }

    @Test
    fun `tag path is not a dashboard deep link`() {
        assertFalse(
            MainActivity.DeepLinkRouter.isDashboardDeepLink(
                host = "pointfinder.pt",
                path = "/tag/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            ),
        )
    }

    @Test
    fun `dashboard sub-path is not matched - only exact path`() {
        // AndroidManifest registers pathPrefix=/dashboard which would match
        // /dashboard/foo, but our in-app handler intentionally only reacts
        // to the exact /dashboard path because email invites land there.
        assertFalse(
            MainActivity.DeepLinkRouter.isDashboardDeepLink(
                host = "pointfinder.pt",
                path = "/dashboard/extra",
            ),
        )
    }

    @Test
    fun `unknown host is rejected`() {
        assertFalse(
            MainActivity.DeepLinkRouter.isDashboardDeepLink(
                host = "malicious.example",
                path = "/dashboard",
            ),
        )
    }

    @Test
    fun `null host is rejected`() {
        assertFalse(
            MainActivity.DeepLinkRouter.isDashboardDeepLink(
                host = null,
                path = "/dashboard",
            ),
        )
    }

    @Test
    fun `null path is rejected`() {
        assertFalse(
            MainActivity.DeepLinkRouter.isDashboardDeepLink(
                host = "pointfinder.pt",
                path = null,
            ),
        )
    }

    @Test
    fun `empty path is rejected`() {
        assertFalse(
            MainActivity.DeepLinkRouter.isDashboardDeepLink(
                host = "pointfinder.pt",
                path = "",
            ),
        )
    }
}
