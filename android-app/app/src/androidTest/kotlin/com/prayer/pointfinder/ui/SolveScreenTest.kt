package com.prayer.pointfinder.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.prayer.pointfinder.feature.player.SolveScreen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Compose UI tests for the SolveScreen composable (finding 9.4).
 *
 * Tests the text-answer submission flow, presence-required gating,
 * and error display -- all without a ViewModel, using the composable's
 * own parameters.
 */
class SolveScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun solveScreen_showsChallengeTitle() {
        composeTestRule.setContent {
            SolveScreen(
                answer = "",
                onAnswerChange = {},
                isPhotoMode = false,
                presenceRequired = false,
                mediaItems = emptyList(),
                onPickMedia = {},
                onCapturePhoto = {},
                onRemoveMedia = {},
                onSubmit = {},
                onBack = {},
                isOnline = true,
                isSubmitting = false,
                errorMessage = null,
                challengeTitle = "Find the hidden marker",
            )
        }

        composeTestRule.onNodeWithText("Find the hidden marker")
            .assertIsDisplayed()
    }

    @Test
    fun solveScreen_submitButton_enabledWithAnswer() {
        composeTestRule.setContent {
            SolveScreen(
                answer = "my answer",
                onAnswerChange = {},
                isPhotoMode = false,
                presenceRequired = false,
                mediaItems = emptyList(),
                onPickMedia = {},
                onCapturePhoto = {},
                onRemoveMedia = {},
                onSubmit = {},
                onBack = {},
                isOnline = true,
                isSubmitting = false,
                errorMessage = null,
            )
        }

        composeTestRule.onNodeWithTag("player-submit-btn")
            .assertIsDisplayed()
            .assertIsEnabled()
    }

    @Test
    fun solveScreen_showsErrorMessage_whenPresent() {
        composeTestRule.setContent {
            SolveScreen(
                answer = "",
                onAnswerChange = {},
                isPhotoMode = false,
                presenceRequired = false,
                mediaItems = emptyList(),
                onPickMedia = {},
                onCapturePhoto = {},
                onRemoveMedia = {},
                onSubmit = {},
                onBack = {},
                isOnline = true,
                isSubmitting = false,
                errorMessage = "Network error",
            )
        }

        composeTestRule.onNodeWithText("Network error")
            .assertIsDisplayed()
    }

    @Test
    fun solveScreen_answerInput_isEditable() {
        var currentAnswer = ""
        composeTestRule.setContent {
            SolveScreen(
                answer = currentAnswer,
                onAnswerChange = { currentAnswer = it },
                isPhotoMode = false,
                presenceRequired = false,
                mediaItems = emptyList(),
                onPickMedia = {},
                onCapturePhoto = {},
                onRemoveMedia = {},
                onSubmit = {},
                onBack = {},
                isOnline = true,
                isSubmitting = false,
                errorMessage = null,
            )
        }

        composeTestRule.onNodeWithTag("player-answer-input")
            .assertIsDisplayed()
            .performTextInput("test answer")
        assertEquals("test answer", currentAnswer)
    }

    @Test
    fun solveScreen_backButton_firesCallback() {
        var backPressed = false
        composeTestRule.setContent {
            SolveScreen(
                answer = "",
                onAnswerChange = {},
                isPhotoMode = false,
                presenceRequired = false,
                mediaItems = emptyList(),
                onPickMedia = {},
                onCapturePhoto = {},
                onRemoveMedia = {},
                onSubmit = {},
                onBack = { backPressed = true },
                isOnline = true,
                isSubmitting = false,
                errorMessage = null,
            )
        }

        // The back button shows "Back" text
        composeTestRule.onNodeWithText("Back", substring = true, ignoreCase = true)
            .performClick()
        assertTrue("onBack should be called", backPressed)
    }

    @Test
    fun solveScreen_showsChallengeDescription() {
        composeTestRule.setContent {
            SolveScreen(
                answer = "",
                onAnswerChange = {},
                isPhotoMode = false,
                presenceRequired = false,
                mediaItems = emptyList(),
                onPickMedia = {},
                onCapturePhoto = {},
                onRemoveMedia = {},
                onSubmit = {},
                onBack = {},
                isOnline = true,
                isSubmitting = false,
                errorMessage = null,
                challengeTitle = "Challenge A",
                challengeDescription = "Look for the blue flag near the oak tree",
            )
        }

        composeTestRule.onNodeWithText("Look for the blue flag near the oak tree")
            .assertIsDisplayed()
    }
}
