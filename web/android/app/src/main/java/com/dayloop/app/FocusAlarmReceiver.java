package com.dayloop.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.Ringtone;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

/** Fires when the focus timer ends: rings with the chosen system sound and posts a "done" notification. */
public class FocusAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent in) {
        final PendingResult pending = goAsync();
        FocusNative.channels(ctx);
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.cancel(FocusNative.ID_LIVE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, FocusNative.CH_DONE) : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat_dayloop).setContentTitle(in.getStringExtra("title")).setContentText(in.getStringExtra("text"))
            .setAutoCancel(true).setCategory(Notification.CATEGORY_ALARM).setColor(0xFF5B5BD6)
            .setContentIntent(android.app.PendingIntent.getActivity(ctx, 7105, ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName()),
                android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE));
        nm.notify(FocusNative.ID_DONE, b.build());

        Uri uri = FocusNative.soundUri(ctx, in.getStringExtra("uri"));
        final Ringtone r = FocusNative.play(ctx, uri, 10000);
        // keep the process alive while it rings (longest 10 s)
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (r != null && r.isPlaying()) r.stop();
            pending.finish();
        }, 10000);
    }
}
