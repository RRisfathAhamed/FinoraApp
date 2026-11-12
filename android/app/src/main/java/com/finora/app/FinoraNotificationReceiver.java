package com.finora.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Posts Finora reminders in the notification shade and on the lock screen.
 * Alarms are queued by the web layer so reminders survive the app being closed.
 */
public class FinoraNotificationReceiver extends BroadcastReceiver {

    public static final String CHANNEL_ID = "finora-reminders";
    public static final String ACTION_SHOW = "com.finora.app.SHOW_REMINDER";
    public static final String EXTRA_ID = "id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_SHOW.equals(intent.getAction())) return;
        show(
                context,
                intent.getIntExtra(EXTRA_ID, 1),
                intent.getStringExtra(EXTRA_TITLE),
                intent.getStringExtra(EXTRA_BODY));
    }

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel =
                new NotificationChannel(CHANNEL_ID, "Finora reminders", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Salary, EMI and bill reminders");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    public static void show(Context context, int id, String title, String body) {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        ensureChannel(context);

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                id,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_finora)
                .setContentTitle(title == null ? "Finora reminder" : title)
                .setContentText(body == null ? "" : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body == null ? "" : body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setContentIntent(contentIntent)
                .build();

        try {
            NotificationManagerCompat.from(context).notify(id, notification);
        } catch (SecurityException ignored) {
            // Notification permission revoked between check and post.
        }
    }

    public static void schedule(Context context, int id, String title, String body, long triggerAtMillis) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;

        Intent intent = new Intent(context, FinoraNotificationReceiver.class);
        intent.setAction(ACTION_SHOW);
        intent.putExtra(EXTRA_ID, id);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_BODY, body);
        PendingIntent pending = PendingIntent.getBroadcast(
                context,
                id,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        long at = Math.max(triggerAtMillis, System.currentTimeMillis() + 5_000L);
        boolean exact = Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms();
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                if (exact) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
                else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            } else {
                manager.set(AlarmManager.RTC_WAKEUP, at, pending);
            }
        } catch (SecurityException ignored) {
            manager.set(AlarmManager.RTC_WAKEUP, at, pending);
        }
    }

    public static void cancel(Context context, int id) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) {
            Intent intent = new Intent(context, FinoraNotificationReceiver.class);
            intent.setAction(ACTION_SHOW);
            PendingIntent pending = PendingIntent.getBroadcast(
                    context,
                    id,
                    intent,
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pending != null) {
                manager.cancel(pending);
                pending.cancel();
            }
        }
        NotificationManagerCompat.from(context).cancel(id);
    }
}
