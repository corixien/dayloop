package com.dayloop.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.Ringtone;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

/** Rings (looping) until the user stops it; shows the heads-up "done" notification and the alarm pop-up. */
public class FocusRingService extends Service {
    static final String ACTION_STOP = "com.dayloop.app.STOP_ALARM";
    /** safety net so a forgotten phone does not ring all night */
    private static final long MAX_MS = 30 * 60 * 1000L;
    private static volatile boolean ringing;
    private Ringtone ringtone;
    private final Handler handler = new Handler(Looper.getMainLooper());

    static boolean isRinging() { return ringing; }

    static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, FocusRingService.class));
    }

    @Override
    public int onStartCommand(Intent in, int flags, int startId) {
        if (in != null && ACTION_STOP.equals(in.getAction())) { stopSelf(); return START_NOT_STICKY; }
        FocusNative.channels(this);
        Intent open = DayloopWidget.overlayIntent(this, "alarm");
        int pf = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent show = PendingIntent.getActivity(this, 7105, open, pf);
        PendingIntent stop = PendingIntent.getService(this, 7106, new Intent(this, FocusRingService.class).setAction(ACTION_STOP), pf);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, FocusNative.CH_DONE) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_dayloop).setContentTitle(in == null ? "" : in.getStringExtra("title")).setContentText(in == null ? "" : in.getStringExtra("text"))
            .setOngoing(true).setCategory(Notification.CATEGORY_ALARM).setColor(0xFF5B5BD6).setContentIntent(show)
            .setFullScreenIntent(show, true)
            .addAction(new Notification.Action.Builder(null, in == null ? "Stop" : in.getStringExtra("stop"), stop).build());
        if (Build.VERSION.SDK_INT >= 29) startForeground(FocusNative.ID_DONE, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(FocusNative.ID_DONE, b.build());

        ringing = true;
        if (ringtone != null) ringtone.stop();
        ringtone = FocusNative.play(this, FocusNative.soundUri(this, in == null ? "" : in.getStringExtra("uri")), 0);
        if (ringtone != null && Build.VERSION.SDK_INT >= 28) ringtone.setLooping(true);
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null && Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 600, 500}, 0));
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::stopSelf, MAX_MS);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        ringing = false;
        handler.removeCallbacksAndMessages(null);
        if (ringtone != null) { ringtone.stop(); ringtone = null; }
        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null) v.cancel();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) { return null; }
}
