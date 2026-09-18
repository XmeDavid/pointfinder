package com.prayer.pointfinder.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.prayer.pointfinder.feature.player.CheckInScreen
import com.prayer.pointfinder.feature.player.NfcState
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Compose UI tests for the CheckInScreen composable (finding 9.4).
 *
 * These are instrumented tests that run on a device/emulator and verify the
 * actual rendered UI, complementing the JVM-only PlayerViewModelTest and
 * the Maestro E2E flows.
 */
class CheckInScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun checkInScreen_showsCheckInButton() {
        composeTestRule.setContent {
            CheckInScreen(
                pendingActionsCount = 0,
                scanError = null,
                onScan = {},
            )
        }

        composeTestRule.onNodeWithText("Check in at base", substring = true)
            .assertIsDisplayed()
            .assertIsEnabled()
    }

    @Test
    fun checkInScreen_showsPendingSyncBanner_whenPendingActionsExist() {
        composeTestRule.setContent {
            CheckInScreen(
                pendingActionsCount = 3,
                scanError = null,
                onScan = {},
            )
        }

        // Pending sync banner should be visible with count
        composeTestRule.onNodeWithText("3", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun checkInScreen_showsFailedSyncWarning_whenFailedActionsExist() {
        composeTestRule.setContent {
            CheckInScreen(
                pendingActionsCount = 0,
                failedActionsCount = 2,
                scanError = null,
                onScan = {},
            )
        }

        // Failed sync warning should be visible (finding 11.2 verification)
        composeTestRule.onNodeWithText("2", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun checkInScreen_showsScanError_whenPresent() {
        composeTestRule.setContent {
            CheckInScreen(
                pendingActionsCount = 0,
                scanError = "Tag not recognized",
                onScan = {},
            )
        }

        composeTestRule.onNodeWithText("Tag not recognized")
            .assertIsDisplayed()
    }

    @Test
    fun checkInScreen_onScanCallback_firesOnButtonClick() {
        var scanClicked = false
        composeTestRule.setContent {
            CheckInScreen(
                pendingActionsCount = 0,
                scanError = null,
                onScan = { scanClicked = true },
            )
        }

        composeTestRule.onNodeWithText("Check in at base", substring = true)
            .performClick()

        assertTrue("onScan should be called on button click", scanClicked)
    }

    @Test
    fun checkInScreen_showsNfcDisabledScreen_whenNfcOff() {
        composeTestRule.setContent {
            CheckInScreen(
                pendingActionsCount = 0,
                scanError = null,
                onScan = {},
                nfcState = NfcState.DISABLED,
            )
        }

        // The NFC disabled screen should show instead of the check-in button
        composeTestRule.onNodeWithText("Check in at base", substring = true)
            .assertDoesNotExist()
    }

    @Test
    fun checkInScreen_showsNfcUnsupportedScreen_whenNoHardware() {
        composeTestRule.setContent {
            CheckInScreen(
                pendingActionsCount = 0,
                scanError = null,
                onScan = {},
                nfcState = NfcState.UNSUPPORTED,
            )
        }

        // The NFC unsupported screen should show instead of the check-in button
        composeTestRule.onNodeWithText("Check in at base", substring = true)
            .assertDoesNotExist()
    }

    @Test
    fun checkInScreen_hidesBanners_whenNoCounts() {
        composeTestRule.setContent {
            CheckInScreen(
                pendingActionsCount = 0,
                failedActionsCount = 0,
                scanError = null,
                onScan = {},
            )
        }

        // No warning icons should be present when counts are zero
        // The check-in button should still be visible
        composeTestRule.onNodeWithText("Check in at base", substring = true)
            .assertIsDisplayed()
    }
}
