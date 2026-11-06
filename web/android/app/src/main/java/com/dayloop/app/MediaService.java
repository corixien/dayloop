package com.dayloop.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;

/**
 * Notification + media session for audio the web layer plays (Motivation audio and podcasts): shows up in the system media
 * controls, lock screen and notification shade with play/pause, +-15 s and next. The sound itself keeps playing in the WebView;
 * button presses are handed back to it through {@link #sink}.
 */
public class MediaService extends Service {
    static final String CH = "media_playback";
    static final int ID = 7110;
    static final String SYNC = "sync";

    interface Sink { void on(String action, double value); }
    static volatile Sink sink;

    private MediaSession session;

    @Override
    public void onCreate() {
        super.onCreate();
        session = new MediaSession(this, "Dayloop");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { send("play", 0); }
            @Override public void onPause() { send("pause", 0); }
            @Override public void onSkipToNext() { send("next", 0); }
            @Override public void onRewind() { send("rew", 0); }
            @Override public void onFastForward() { send("ff", 0); }
            @Override public void onSeekTo(long pos) { send("seek", pos / 1000.0); }
            @Override public void onStop() { send("stop", 0); }
        });
        session.setActive(true);
    }

    private static void send(String action, double v) {
        Sink s = sink;
        if (s != null) s.on(action, v);
    }

    @Override
    public int onStartCommand(Intent in, int flags, int startId) {
        String act = in == null ? null : in.getAction();
        if (act != null && act.startsWith("act:")) {
            send(act.substring(4), 0);
            return START_NOT_STICKY;
        }
        if (in == null || !SYNC.equals(act)) { stopSelf(); return START_NOT_STICKY; }
        update(in);
        return START_NOT_STICKY;
    }

    private PendingIntent action(String name) {
        Intent i = new Intent(this, MediaService.class).setAction("act:" + name);
        return PendingIntent.getService(this, name.hashCode() & 0xffff, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification.Action act(int icon, String label, String name) {
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label, action(name)).build();
    }

    private void update(Intent in) {
        String title = in.getStringExtra("title");
        boolean playing = in.getBooleanExtra("playing", false);
        long pos = in.getLongExtra("pos", 0), dur = in.getLongExtra("dur", 0);
        boolean hasNext = in.getBooleanExtra("hasNext", false);

        session.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title == null ? "" : title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, "Dayloop")
            .putLong(MediaMetadata.METADATA_KEY_DURATION, dur > 0 ? dur : -1).build());
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SEEK_TO
            | PlaybackState.ACTION_REWIND | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_STOP | (hasNext ? PlaybackState.ACTION_SKIP_TO_NEXT : 0);
        session.setPlaybackState(new PlaybackState.Builder().setActions(actions)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, pos, playing ? 1f : 0f).build());

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH, "Audio", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent open = PendingIntent.getActivity(this, ID, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_dayloop).setContentTitle(title).setContentText("Dayloop").setContentIntent(open)
            .setColor(0xFF5B5BD6).setOnlyAlertOnce(true).setOngoing(playing).setShowWhen(false).setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(act(android.R.drawable.ic_media_rew, "-15", "rew"))
            .addAction(act(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Play", "toggle"))
            .addAction(act(android.R.drawable.ic_media_ff, "+15", "ff"));
        if (hasNext) b.addAction(act(android.R.drawable.ic_media_next, "Next", "next"));
        b.setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, hasNext ? 3 : 2));
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(ID, n);
        // paused: the notification stays but can be swiped away
        if (!playing) stopForeground(false);
    }

    @Override
    public void onDestroy() {
        stopForeground(true);
        if (session != null) { session.setActive(false); session.release(); session = null; }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
