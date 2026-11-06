package com.mcl.mcllendingapp.presentation.login

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import com.mcl.mcllendingapp.ui.theme.MCLLendingAppTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class LoginContentTest {
    @get:Rule val compose = createComposeRule()

    @Test fun signInRequiresBothFieldsAndSubmitsEnteredCredentials() {
        var state by mutableStateOf(LoginUiState())
        var submitted: Pair<String, String>? = null
        compose.setContent {
            MCLLendingAppTheme {
                LoginContent(state, null, {}, { event ->
                    when (event) {
                        is LoginEvent.Email -> state = state.copy(email = event.value)
                        is LoginEvent.Password -> state = state.copy(password = event.value)
                        LoginEvent.Submit -> submitted = state.email to state.password
                        is LoginEvent.ImportConfig -> Unit
                    }
                })
            }
        }
        compose.onNodeWithText("Sign in").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("Email").performScrollTo().performTextInput("tester@example.com")
        compose.onNodeWithText("Sign in").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("Password").performScrollTo().performTextInput("test-password")
        compose.onNodeWithText("Sign in").performScrollTo().assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals("tester@example.com" to "test-password", submitted) }
    }

    @Test fun pendingSignInDisablesCredentialsAndSubmit() {
        compose.setContent {
            MCLLendingAppTheme {
                LoginContent(LoginUiState("tester@example.com", "test-password", busy = true), null, {}, {})
            }
        }
        compose.onNodeWithText("Email").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("Password").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("Signing in…").performScrollTo().assertIsNotEnabled()
    }

    @Test fun missingConfigurationOffersImportAndPreservesAccessError() {
        val error = "Missing google-services.json."
        var imports = 0
        compose.setContent {
            MCLLendingAppTheme {
                LoginContent(LoginUiState(), error, {}, {}, onImport = { imports++ })
            }
        }
        compose.onNodeWithText(error).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Import Firebase configuration").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(1, imports) }
    }

    @Test fun failedSignInDisplaysActionableErrorAndAllowsRetry() {
        val error = "Sign-in failed. Check your email and password."
        compose.setContent {
            MCLLendingAppTheme {
                LoginContent(LoginUiState("tester@example.com", "test-password", error = error), null, {}, {})
            }
        }
        compose.onNodeWithText(error).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Sign in").performScrollTo().assertIsEnabled()
    }
}
