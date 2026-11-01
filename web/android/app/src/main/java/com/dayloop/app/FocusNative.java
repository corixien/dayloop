package com.dayloop.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/** Focus timer outside the WebView: live notification with countdown, end alarm with a system sound. */
final class FocusNative {
    static final String CH_LIVE = "focus_live", CH_DONE = "focus_done";
    static final int ID_LIVE = 7101, ID_DONE = 7102, REQ_ALARM = 7103, REQ_OPEN = 7104;
    private static Ringtone preview;

    private FocusNative() {}

    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        NotificationChannel live = new NotificationChannel(CH_LIVE, "Fokus-Timer", NotificationManager.IMPORTANCE_LOW);
        live.setShowBadge(false);
        nm.createNotificationChannel(live);
        NotificationChannel done = new NotificationChannel(CH_DONE, "Fokus beendet", NotificationManager.IMPORTANCE_HIGH);
        done.setSound(null, null);
        nm.createNotificationChannel(done);
    }

    private static PendingIntent openIntent(Context ctx) {
        Intent i = DayloopWidget.overlayIntent(ctx, "focus");
        return PendingIntent.getActivity(ctx, REQ_OPEN, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** status: running | paused | idle. */
    static void sync(Context ctx, JSONObject o) throws Exception {
        String status = o.optString("status", "idle");
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        Intent alarm = new Intent(ctx, FocusAlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ_ALARM, alarm, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if ("idle".equals(status)) {
            am.cancel(pi);
            nm.cancel(ID_LIVE);
            return;
        }
        channels(ctx);
        long endsAt = o.optLong("endsAt", 0);
        String title = o.optString("title", "Fokus");
        String text = o.optString("text", "");
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CH_LIVE) : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat_dayloop).setContentTitle(title).setOngoing(true).setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS).setContentIntent(openIntent(ctx)).setColor(0xFF5B5BD6).setShowWhen(true);
        if (!text.isEmpty()) b.setContentText(text);
        if ("running".equals(status) && endsAt > 0) {
            b.setWhen(endsAt).setUsesChronometer(true).setChronometerCountDown(true);
            if (Build.VERSION.SDK_INT >= 36) {
                b.setShortCriticalText(o.optString("clock", ""));
                b.getExtras().putBoolean("android.requestPromotedOngoing", true);
            }
            // exact end alarm: rings even when the app is closed
            alarm.putExtra("uri", o.optString("soundUri", ""));
            alarm.putExtra("title", o.optString("doneTitle", "Fokus beendet"));
            alarm.putExtra("text", o.optString("doneText", ""));
            PendingIntent pi2 = PendingIntent.getBroadcast(ctx, REQ_ALARM, alarm, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi2);
        } else {
            b.setShowWhen(false).setSubText(o.optString("clock", ""));
            am.cancel(pi);
        }
        nm.notify(ID_LIVE, b.build());
    }

    static Uri soundUri(Context ctx, String uri) {
        if (uri != null && !uri.isEmpty()) return Uri.parse(uri);
        return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
    }

    /** Plays the sound on the alarm stream, loud, at most maxMs. Returns the ringtone. */
    static Ringtone play(Context ctx, Uri uri, long maxMs) {
        Ringtone r = RingtoneManager.getRingtone(ctx, uri);
        if (r == null) return null;
        r.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        if (Build.VERSION.SDK_INT >= 28) r.setVolume(1f);
        r.play();
        return r;
    }

    static void playPreview(Context ctx, String uri) {
        stopPreview();
        preview = play(ctx, soundUri(ctx, uri), 0);
    }

    static void stopPreview() {
        if (preview != null) { preview.stop(); preview = null; }
    }

    /** Installed sounds (Samsung's included): alarms, notifications, ringtones. */
    static JSONArray list(Context ctx) throws Exception {
        JSONArray out = new JSONArray();
        int[] kinds = {RingtoneManager.TYPE_ALARM, RingtoneManager.TYPE_NOTIFICATION, RingtoneManager.TYPE_RINGTONE};
        String[] names = {"alarm", "notification", "ringtone"};
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        for (int k = 0; k < kinds.length; k++) {
            RingtoneManager rm = new RingtoneManager(ctx);
            rm.setType(kinds[k]);
            Cursor c = rm.getCursor();
            while (c != null && c.moveToNext()) {
                String uri = rm.getRingtoneUri(c.getPosition()).toString();
                if (!seen.add(uri)) continue;
                out.put(new JSONObject().put("title", c.getString(RingtoneManager.TITLE_COLUMN_INDEX)).put("uri", uri).put("kind", names[k]));
            }
        }
        return out;
    }
}
