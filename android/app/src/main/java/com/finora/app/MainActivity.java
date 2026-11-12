package com.finora.app;

import android.Manifest;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public class MainActivity extends BridgeActivity {

    private static final int REQ_PERMISSIONS = 4701;
    private static final int REQ_PICK_CONTACT = 4702;

    /** Reads the on-device SMS inbox for bank-message detection. */
    public static class SmsBridgeInterface {
        private final MainActivity activity;

        public SmsBridgeInterface(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public String hasPermission() {
            return activity.granted(Manifest.permission.READ_SMS) ? "true" : "false";
        }

        @JavascriptInterface
        public void requestPermission() {
            activity.runOnUiThread(() ->
                    ActivityCompat.requestPermissions(
                            activity,
                            new String[]{Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS},
                            REQ_PERMISSIONS));
        }

        /** Returns the newest messages as JSON: [{id,address,body,date}]. */
        @JavascriptInterface
        public String readMessages(int sinceDays) {
            if (!activity.granted(Manifest.permission.READ_SMS)) return "[]";
            int days = Math.max(1, Math.min(90, sinceDays));
            long since = System.currentTimeMillis() - (days * 86_400_000L);
            JSONArray out = new JSONArray();
            Cursor cursor = null;
            try {
                cursor = activity.getContentResolver().query(
                        Uri.parse("content://sms/inbox"),
                        new String[]{"_id", "address", "body", "date"},
                        "date >= ?",
                        new String[]{String.valueOf(since)},
                        "date DESC");
                if (cursor != null) {
                    int idIndex = cursor.getColumnIndex("_id");
                    int addressIndex = cursor.getColumnIndex("address");
                    int bodyIndex = cursor.getColumnIndex("body");
                    int dateIndex = cursor.getColumnIndex("date");
                    int count = 0;
                    while (cursor.moveToNext() && count < 200) {
                        String body = bodyIndex >= 0 ? cursor.getString(bodyIndex) : null;
                        if (body == null || body.trim().isEmpty()) continue;
                        JSONObject item = new JSONObject();
                        item.put("id", idIndex >= 0 ? cursor.getString(idIndex) : "");
                        item.put("address", addressIndex >= 0 ? cursor.getString(addressIndex) : "");
                        item.put("body", body);
                        item.put("date", dateIndex >= 0 ? cursor.getLong(dateIndex) : 0L);
                        out.put(item);
                        count += 1;
                    }
                }
            } catch (Exception ignored) {
                // Inbox unavailable on this device — the web layer shows manual entry.
            } finally {
                if (cursor != null) cursor.close();
            }
            return out.toString();
        }
    }

    /** Runtime permission bridge used by the first-run flow and Permissions screen. */
    public class PermsInterface {
        @JavascriptInterface
        public String has(String key) {
            String permission = permissionFor(key);
            return permission == null || granted(permission) ? "true" : "false";
        }

        @JavascriptInterface
        public void request(String key) {
            String permission = permissionFor(key);
            if (permission == null) return;
            activityRequest(new String[]{permission});
        }

        @JavascriptInterface
        public void requestAll() {
            Set<String> wanted = new LinkedHashSet<>();
            if (Build.VERSION.SDK_INT >= 33) wanted.add(Manifest.permission.POST_NOTIFICATIONS);
            wanted.add(Manifest.permission.READ_SMS);
            wanted.add(Manifest.permission.RECEIVE_SMS);
            wanted.add(Manifest.permission.CALL_PHONE);
            wanted.add(Manifest.permission.READ_PHONE_STATE);
            wanted.add(Manifest.permission.CAMERA);
            wanted.add(Manifest.permission.READ_CONTACTS);
            if (Build.VERSION.SDK_INT >= 33) {
                wanted.add(Manifest.permission.READ_MEDIA_IMAGES);
            } else {
                wanted.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
            List<String> missing = new ArrayList<>();
            for (String permission : wanted) {
                if (!granted(permission)) missing.add(permission);
            }
            if (!missing.isEmpty()) activityRequest(missing.toArray(new String[0]));
        }
    }

    /** System contact picker for friend loans, without bulk address-book access. */
    public class ContactsInterface {
        @JavascriptInterface
        public void pick() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(
                            Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
                    startActivityForResult(intent, REQ_PICK_CONTACT);
                } catch (Exception error) {
                    sendPickedContact("", "");
                }
            });
        }
    }

    /** Device reminders, themed system bars, widget pinning and app exit. */
    public class HostInterface {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(MainActivity.this::finish);
        }

        @JavascriptInterface
        public void setChromeColor(String hex) {
            try {
                final int color = Color.parseColor(hex);
                runOnUiThread(() -> {
                    try {
                        View content = findViewById(android.R.id.content);
                        if (content != null) content.setBackgroundColor(color);
                        getWindow().setStatusBarColor(color);
                        getWindow().setNavigationBarColor(color);
                    } catch (Exception ignored) {
                        // Android 15+ ignores bar colours; the padded background still applies.
                    }
                });
            } catch (Exception ignored) {
                // Ignore malformed colours from older web bundles.
            }
        }

        @JavascriptInterface
        public void setLightStatusBars(boolean light) {
            runOnUiThread(() -> {
                try {
                    WindowInsetsControllerCompat controller =
                            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                    controller.setAppearanceLightStatusBars(light);
                    controller.setAppearanceLightNavigationBars(light);
                } catch (Exception ignored) {
                    // Not critical.
                }
            });
        }

        @JavascriptInterface
        public void updateWidget(String json) {
            FinoraWidgetProvider.save(MainActivity.this, json);
            FinoraWidgetProvider.updateAll(MainActivity.this);
        }

        @JavascriptInterface
        public void addWidget() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT < 26) return;
                try {
                    AppWidgetManager manager = AppWidgetManager.getInstance(MainActivity.this);
                    if (!manager.isRequestPinAppWidgetSupported()) return;
                    ComponentName provider = new ComponentName(MainActivity.this, FinoraWidgetProvider.class);
                    manager.requestPinAppWidget(provider, null, null);
                } catch (Exception ignored) {
                    // Launcher does not support pinning.
                }
            });
        }
    }

    /** Posts reminders immediately and queues future ones with AlarmManager. */
    public class NotificationsInterface {
        @JavascriptInterface
        public void post(int id, String title, String body) {
            FinoraNotificationReceiver.show(MainActivity.this, id, title, body);
        }

        @JavascriptInterface
        public void schedule(int id, String title, String body, long at) {
            FinoraNotificationReceiver.schedule(MainActivity.this, id, title, body, at);
        }

        @JavascriptInterface
        public void cancel(int id) {
            FinoraNotificationReceiver.cancel(MainActivity.this, id);
        }
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void activityRequest(String[] permissions) {
        runOnUiThread(() -> ActivityCompat.requestPermissions(this, permissions, REQ_PERMISSIONS));
    }

    private String permissionFor(String key) {
        if (key == null) return null;
        switch (key) {
            case "notifications":
                return Build.VERSION.SDK_INT >= 33 ? Manifest.permission.POST_NOTIFICATIONS : null;
            case "sms":
                return Manifest.permission.READ_SMS;
            case "calls":
                return Manifest.permission.CALL_PHONE;
            case "phone":
                return Manifest.permission.READ_PHONE_STATE;
            case "camera":
                return Manifest.permission.CAMERA;
            case "contacts":
                return Manifest.permission.READ_CONTACTS;
            case "photos":
                return Build.VERSION.SDK_INT >= 33
                        ? Manifest.permission.READ_MEDIA_IMAGES
                        : Manifest.permission.READ_EXTERNAL_STORAGE;
            default:
                return null;
        }
    }

    private void sendPickedContact(String name, String phone) {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("name", name == null ? "" : name);
            payload.put("phone", phone == null ? "" : phone);
            String script = "window.FinoraContactsPicked && window.FinoraContactsPicked("
                    + JSONObject.quote(payload.toString())
                    + ")";
            webView.evaluateJavascript(script, null);
        } catch (Exception ignored) {
            // The picker result is optional.
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_PICK_CONTACT) return;

        String name = "";
        String phone = "";
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            Cursor cursor = null;
            try {
                cursor = getContentResolver().query(
                        data.getData(),
                        new String[]{
                                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                                ContactsContract.CommonDataKinds.Phone.NUMBER,
                        },
                        null,
                        null,
                        null);
                if (cursor != null && cursor.moveToFirst()) {
                    name = cursor.getString(0);
                    phone = cursor.getString(1);
                }
            } catch (Exception ignored) {
                // Contact could not be read; the form keeps manual entry.
            } finally {
                if (cursor != null) cursor.close();
            }
        }
        sendPickedContact(name, phone);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        registerPlugin(FinoraBiometricPlugin.class);
        super.onCreate(savedInstanceState);
        FinoraNotificationReceiver.ensureChannel(this);

        WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
        if (webView != null) {
            webView.addJavascriptInterface(new SmsBridgeInterface(this), "AndroidSmsBridge");
            webView.addJavascriptInterface(new PermsInterface(), "FinoraNativePerms");
            webView.addJavascriptInterface(new ContactsInterface(), "FinoraContacts");
            webView.addJavascriptInterface(new NotificationsInterface(), "FinoraNotifications");
            webView.addJavascriptInterface(new HostInterface(), "FinoraNativeHost");

            // Keep the web content below the status bar / notch and above the
            // gesture bar instead of drawing underneath the system chrome.
            View parent = webView.getParent() instanceof View ? (View) webView.getParent() : webView;
            ViewCompat.setOnApplyWindowInsetsListener(parent, (view, insets) -> {
                Insets bars = insets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            ViewCompat.requestApplyInsets(parent);
        }

        // Every hardware/gesture Back is consumed here. The web layer closes the
        // topmost sheet or full-screen form, unwinds nested routes, returns to
        // Home, and finally presents the exit confirmation. We only finish if the
        // web layer is not available at all.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                View focused = getCurrentFocus();
                InputMethodManager keyboard =
                        (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (keyboard != null && focused != null && keyboard.isAcceptingText()) {
                    keyboard.hideSoftInputFromWindow(focused.getWindowToken(), 0);
                    return;
                }

                WebView web = bridge != null ? bridge.getWebView() : null;
                if (web == null) {
                    finish();
                    return;
                }

                web.evaluateJavascript(
                        "(window.FinoraAndroidBack && window.FinoraAndroidBack() === true)",
                        new ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String value) {
                                if (!"true".equals(value)) finish();
                            }
                        }
                );
            }
        });
    }
}
