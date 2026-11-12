package com.finora.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;

import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

/**
 * Bridges Android's official BiometricPrompt to the web layer. No biometric
 * material or device credential is ever exposed to JavaScript or stored here.
 */
@CapacitorPlugin(name = "FinoraBiometric")
public class FinoraBiometricPlugin extends Plugin {

    private PluginCall pendingCall;
    private BiometricPrompt biometricPrompt;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        int biometricStatus = BiometricManager.from(getContext())
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
        boolean biometric = biometricStatus == BiometricManager.BIOMETRIC_SUCCESS;
        boolean credential = hasDeviceCredential();
        boolean available = biometric || credential;

        result.put("available", available);
        result.put("biometric", biometric);
        result.put("credential", credential);
        if (!available) {
            if (biometricStatus == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
                result.put("reason", "No fingerprint or face is enrolled. Add one in Android Settings, or set a device PIN, pattern or password.");
            } else if (biometricStatus == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE) {
                result.put("reason", "This device has no biometric hardware. Set a device PIN, pattern or password to use app lock.");
            } else {
                result.put("reason", "Set a secure screen lock in Android Settings before enabling app lock.");
            }
        }
        call.resolve(result);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        if (pendingCall != null) {
            call.reject("An authentication request is already in progress.");
            return;
        }

        Activity activity = getActivity();
        if (!(activity instanceof FragmentActivity)) {
            finishError(call, "UNAVAILABLE", "Authentication needs an active Finora window.");
            return;
        }

        int biometricStatus = BiometricManager.from(getContext())
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
        boolean biometric = biometricStatus == BiometricManager.BIOMETRIC_SUCCESS;
        boolean credential = hasDeviceCredential();
        if (!biometric && !credential) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("code", "UNAVAILABLE");
            result.put("message", "No fingerprint, face or device credential is available.");
            call.resolve(result);
            return;
        }

        if (!biometric) {
            launchDeviceCredential(call);
            return;
        }

        pendingCall = call;
        final FragmentActivity fragmentActivity = (FragmentActivity) activity;
        final boolean credentialFallback = credential;

        fragmentActivity.runOnUiThread(() -> {
            try {
                Executor executor = ContextCompat.getMainExecutor(fragmentActivity);
                BiometricPrompt.AuthenticationCallback callback = new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        finishSuccess();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON && credentialFallback) {
                            launchDeviceCredential(pendingCall);
                            return;
                        }
                        finishError(errorCode, errString.toString());
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // The prompt remains open so the user can try again.
                    }
                };

                biometricPrompt = new BiometricPrompt(fragmentActivity, executor, callback);
                BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle("Unlock Finora")
                        .setSubtitle("Confirm it's you to continue")
                        .setDescription("Your financial records stay on this device.")
                        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                        .setConfirmationRequired(false)
                        .setNegativeButtonText(credentialFallback ? "Use device PIN" : "Cancel");

                biometricPrompt.authenticate(info.build());
            } catch (Exception error) {
                finishError(pendingCall, "UNAVAILABLE", error.getMessage() == null
                        ? "Authentication could not start."
                        : error.getMessage());
            }
        });
    }

    private boolean hasDeviceCredential() {
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    private void launchDeviceCredential(PluginCall call) {
        if (call == null) return;
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        if (keyguard == null || !keyguard.isDeviceSecure()) {
            finishError(call, "NO_DEVICE_CREDENTIAL", "No device PIN, pattern or password is configured.");
            return;
        }
        Intent intent = keyguard.createConfirmDeviceCredentialIntent(
                "Unlock Finora",
                "Confirm your device PIN, pattern or password"
        );
        if (intent == null) {
            finishError(call, "NO_DEVICE_CREDENTIAL", "Device credential confirmation is not available.");
            return;
        }
        pendingCall = call;
        startActivityForResult(call, intent, "credentialResult");
    }

    @ActivityCallback
    public void credentialResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK) {
            pendingCall = call;
            finishSuccess();
        } else {
            finishError(call, "CANCELED", "Authentication was cancelled.");
        }
    }

    private void finishSuccess() {
        JSObject result = new JSObject();
        result.put("success", true);
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call != null) call.resolve(result);
    }

    private void finishError(int errorCode, String message) {
        JSObject result = new JSObject();
        result.put("success", false);
        result.put("code", errorCodeName(errorCode));
        result.put("message", message);
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call != null) call.resolve(result);
    }

    private void finishError(PluginCall call, String code, String message) {
        JSObject result = new JSObject();
        result.put("success", false);
        result.put("code", code);
        result.put("message", message);
        if (pendingCall == call) pendingCall = null;
        if (call != null) call.resolve(result);
    }

    private String errorCodeName(int errorCode) {
        if (errorCode == BiometricPrompt.ERROR_USER_CANCELED
                || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                || errorCode == BiometricPrompt.ERROR_CANCELED) {
            return "CANCELED";
        }
        if (errorCode == BiometricPrompt.ERROR_LOCKOUT
                || errorCode == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) {
            return "LOCKOUT";
        }
        if (errorCode == BiometricPrompt.ERROR_NO_BIOMETRICS) return "NO_BIOMETRICS";
        if (errorCode == BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL) return "NO_DEVICE_CREDENTIAL";
        if (errorCode == BiometricPrompt.ERROR_HW_UNAVAILABLE) return "HW_UNAVAILABLE";
        if (errorCode == BiometricPrompt.ERROR_TIMEOUT) return "TIMEOUT";
        return "ERROR_" + errorCode;
    }
}
