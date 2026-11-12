package com.finora.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Native home-screen widget. The web layer pushes a small snapshot through the
 * host bridge; the widget itself only renders plain text so it stays fast and
 * never needs to reach into IndexedDB.
 */
public class FinoraWidgetProvider extends AppWidgetProvider {

    public static final String PREFS = "finora-widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    public static void save(Context context, String json) {
        try {
            JSONObject object = new JSONObject(json);
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            prefs.edit()
                    .putString("label", object.optString("label", "NET WORTH"))
                    .putString("value", object.optString("value", "—"))
                    .putString("sub", object.optString("sub", "Open Finora"))
                    .putString("updated", object.optString("updated", ""))
                    .apply();
        } catch (Exception ignored) {
            // A malformed snapshot must never crash the widget.
        }
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, FinoraWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(provider);
        for (int id : ids) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    private static RemoteViews buildViews(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.finora_widget);
        views.setTextViewText(R.id.widget_label, prefs.getString("label", "NET WORTH"));
        views.setTextViewText(R.id.widget_value, prefs.getString("value", "Open Finora"));
        views.setTextViewText(R.id.widget_sub, prefs.getString("sub", "Tap to view your money"));
        views.setTextViewText(R.id.widget_updated, prefs.getString("updated", ""));

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
        return views;
    }
}
