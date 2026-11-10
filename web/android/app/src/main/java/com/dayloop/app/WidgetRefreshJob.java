package com.dayloop.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Keeps the widget current while the app is closed: fetches todos and plan blocks from the server (widget API token) and lets a
 * hidden WebView run the very same snapshot code as the app (`widget-bg.js`). Runs every 15 minutes (JobScheduler), every ~5 minutes
 * while the screen is on (inexact alarm) and when the widget is used. Skipped while the app itself is feeding the widget.
 */
public class WidgetRefreshJob extends JobService {
    private static final String TAG = "DayloopWidgetBg";
    static final String ACTION_REFRESH = "com.dayloop.app.WIDGET_REFRESH";
    private static final int PERIODIC = 7101, ONCE = 7102, ALARM = 7103;
    private static final long APP_FRESH_MS = 90_000;

    /** Periodic job + the 5-minute alarm. Safe to call again and again. */
    static void schedule(Context c) {
        try {
            scheduleUnchecked(c.getApplicationContext());
        } catch (Exception e) {
            Log.w(TAG, "schedule failed: " + e); // never take the app down for a refresh helper
        }
    }

    private static void scheduleUnchecked(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null && js.getPendingJob(PERIODIC) == null) {
            js.schedule(new JobInfo.Builder(PERIODIC, new ComponentName(ctx, WidgetRefreshJob.class))
                .setPeriodic(15 * 60_000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build());
        }
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, ALARM, new Intent(ctx, DayloopWidget.class).setAction(ACTION_REFRESH), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (am != null) am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 5 * 60_000L, 5 * 60_000L, pi);
    }

    /** Refresh now (as soon as the system lets the job run). */
    static void kick(Context c) {
        try {
            kickUnchecked(c.getApplicationContext());
        } catch (Exception e) {
            Log.w(TAG, "kick failed: " + e);
        }
    }

    private static void kickUnchecked(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        ComponentName cn = new ComponentName(ctx, WidgetRefreshJob.class);
        try {
            JobInfo.Builder b = new JobInfo.Builder(ONCE, cn).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
            if (Build.VERSION.SDK_INT >= 31) b.setExpedited(true); else b.setOverrideDeadline(0);
            js.schedule(b.build());
        } catch (Exception e) {
            js.schedule(new JobInfo.Builder(ONCE, cn).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setOverrideDeadline(0).build());
        }
    }

    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context app = getApplicationContext();
        JSONObject snap = WidgetStore.snapshot(app);
        if (!WidgetStore.hasCredentials(app) || snap.optJSONObject("meta") == null) return false; // nothing to refresh yet / not signed in
        if (System.currentTimeMillis() - WidgetStore.lastApp(app) < APP_FRESH_MS) return false; // the app is feeding the widget itself
        new Thread(() -> run(app, params, snap)).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }

    private void run(final Context app, final JobParameters params, JSONObject prev) {
        final AtomicBoolean finished = new AtomicBoolean();
        final Runnable fail = () -> { if (finished.compareAndSet(false, true)) jobFinished(params, true); };
        try {
            JSONObject meta = prev.getJSONObject("meta");
            JSONObject in = new JSONObject()
                .put("lang", prev.optString("lang", "de"))
                .put("hour", meta.optInt("hour", 9))
                .put("sent", meta.optBoolean("tracker", false) ? meta.optJSONArray("sent") : JSONObject.NULL)
                .put("now", System.currentTimeMillis())
                .put("tasks", fetch(app, "task"))
                .put("plans", fetch(app, "plan"))
                .put("pending", WidgetStore.pending(app));
            final String input = JSONObject.quote(in.toString());
            final String bundle = asset(app, "public/widget-bg.js");
            main.post(() -> {
                final WebView wv = new WebView(app);
                final Runnable done = () -> main.post(wv::destroy);
                wv.getSettings().setJavaScriptEnabled(true);
                wv.addJavascriptInterface(new Object() {
                    @JavascriptInterface public void ok(String json) {
                        try {
                            JSONObject out = new JSONObject(json);
                            out.put("meta", prev.getJSONObject("meta"));
                            WidgetStore.saveSnapshot(app, out);
                            WidgetStore.markSynced(app, false);
                            DayloopWidget.refreshAll(app);
                            Log.i(TAG, "refreshed: todo=" + out.optJSONArray("todo").length() + " done=" + out.optJSONArray("done").length() + " plan=" + out.optJSONArray("plan").length());
                            if (finished.compareAndSet(false, true)) jobFinished(params, false);
                        } catch (Exception e) {
                            Log.w(TAG, "save failed", e);
                            fail.run();
                        }
                        done.run();
                    }
                    @JavascriptInterface public void fail(String m) { Log.w(TAG, "build failed: " + m); fail.run(); done.run(); }
                }, "Bg");
                wv.setWebViewClient(new WebViewClient() {
                    boolean started;
                    @Override public void onPageFinished(WebView v, String url) {
                        if (started) return;
                        started = true;
                        v.evaluateJavascript(bundle, r -> v.evaluateJavascript("(function(){try{Bg.ok(dayloopBuild(" + input + "))}catch(e){Bg.fail(String(e))}})()", null));
                    }
                });
                main.postDelayed(() -> { if (!finished.get()) { Log.w(TAG, "timeout"); fail.run(); done.run(); } }, 30_000);
                wv.loadDataWithBaseURL("https://localhost/", "<html></html>", "text/html", "utf-8", null);
            });
        } catch (Exception e) {
            Log.w(TAG, "refresh failed: " + e);
            fail.run();
        }
    }

    private static JSONArray fetch(Context c, String type) throws Exception {
        String url = WidgetStore.url(c), token = WidgetStore.token(c);
        HttpURLConnection con = (HttpURLConnection) new URL(url + "/api/items?type=" + type).openConnection();
        try {
            con.setConnectTimeout(15000);
            con.setReadTimeout(45000); // Render free tier wakes up slowly
            con.setRequestProperty("Authorization", "Bearer " + token);
            if (con.getResponseCode() != 200) throw new Exception("HTTP " + con.getResponseCode());
            return new JSONArray(read(con.getInputStream()));
        } finally {
            con.disconnect();
        }
    }

    private static String asset(Context c, String path) throws Exception {
        try (InputStream in = c.getAssets().open(path)) { return read(in); }
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        return out.toString(StandardCharsets.UTF_8.name());
    }
}
