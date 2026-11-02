package com.dayloop.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Fires when the focus timer ends: hands over to the ring service (loops until stopped, heads-up + pop-up). */
public class FocusAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent in) {
        FocusNative.channels(ctx);
        ctx.getSystemService(android.app.NotificationManager.class).cancel(FocusNative.ID_LIVE);
        Intent svc = new Intent(ctx, FocusRingService.class).putExtras(in);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(svc); else ctx.startService(svc);
    }
}
