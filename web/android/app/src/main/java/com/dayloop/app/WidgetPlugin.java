package com.dayloop.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Bridge between the web app and the home screen widget. */
@CapacitorPlugin(name = "DayloopWidget")
public class WidgetPlugin extends Plugin {
    /** Snapshot of todos and Have Done rows, already formatted by the web layer. */
    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        WidgetStore.saveSnapshot(ctx, call.getData());
        DayloopWidget.refreshAll(ctx);
        call.resolve();
    }

    /** API token the widget uses to tick todos without opening the app. */
    @PluginMethod
    public void setCredentials(PluginCall call) {
        WidgetStore.setCredentials(getContext(), call.getString("url", ""), call.getString("token", ""));
        call.resolve();
    }

    /** Completions made in the widget that the server did not take yet. */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject out = new JSObject();
        JSONArray a = WidgetStore.takePending(getContext());
        out.put("actions", a);
        call.resolve(out);
    }

    @PluginMethod
    public void finishOverlay(PluginCall call) {
        if (getActivity() != null) getActivity().finish();
        call.resolve();
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        Context ctx = getContext();
        android.content.Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch != null) ctx.startActivity(launch);
        if (getActivity() instanceof OverlayActivity) getActivity().finish();
        call.resolve();
    }

    /** Focus timer state for the live notification and the end alarm. */
    @PluginMethod
    public void focusSync(PluginCall call) {
        try {
            FocusNative.sync(getContext(), call.getData());
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void alarmRinging(PluginCall call) {
        JSObject out = new JSObject();
        out.put("ringing", FocusRingService.isRinging());
        call.resolve(out);
    }

    @PluginMethod
    public void stopAlarm(PluginCall call) {
        FocusRingService.stop(getContext());
        call.resolve();
    }

    /** Is Dayloop the selected digital assistant (power-button long press)? */
    @PluginMethod
    public void assistantActive(PluginCall call) {
        String cur = android.provider.Settings.Secure.getString(getContext().getContentResolver(), "assistant");
        JSObject out = new JSObject();
        out.put("active", cur != null && cur.startsWith(getContext().getPackageName() + "/"));
        call.resolve(out);
    }

    @PluginMethod
    public void openAssistantSettings(PluginCall call) {
        Context ctx = getContext();
        android.content.Intent i = new android.content.Intent(android.provider.Settings.ACTION_VOICE_INPUT_SETTINGS).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); }
        catch (Exception e) { ctx.startActivity(new android.content.Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)); }
        call.resolve();
    }

    /** Podcast episode for offline listening: streamed to the app's files folder on a worker thread. */
    @PluginMethod
    public void downloadFile(final PluginCall call) {
        final String url = call.getString("url", "");
        final String name = call.getString("name", "file").replaceAll("[^A-Za-z0-9._-]", "_");
        new Thread(() -> {
            java.net.HttpURLConnection c = null;
            try {
                java.io.File dir = new java.io.File(getContext().getFilesDir(), "podcasts");
                dir.mkdirs();
                java.io.File part = new java.io.File(dir, name + ".part");
                String u = url;
                for (int i = 0; i < 6; i++) {
                    c = (java.net.HttpURLConnection) new java.net.URL(u).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    c.setRequestProperty("User-Agent", "Dayloop/1.0");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                        u = new java.net.URL(new java.net.URL(u), c.getHeaderField("Location")).toString();
                        c.disconnect();
                        continue;
                    }
                    break;
                }
                if (c == null || c.getResponseCode() != 200) throw new Exception("http " + (c == null ? 0 : c.getResponseCode()));
                long total = c.getContentLengthLong(), got = 0, lastNote = 0;
                try (java.io.InputStream in = c.getInputStream(); java.io.FileOutputStream out = new java.io.FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        got += n;
                        if (total > 0 && got - lastNote > 512 * 1024) {
                            lastNote = got;
                            JSObject p = new JSObject();
                            p.put("name", name);
                            p.put("pct", (int) (got * 100 / total));
                            notifyListeners("dlProgress", p);
                        }
                    }
                }
                java.io.File done = new java.io.File(dir, name);
                if (done.exists()) done.delete();
                part.renameTo(done);
                JSObject out = new JSObject();
                out.put("path", done.getAbsolutePath());
                out.put("size", done.length());
                call.resolve(out);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        try {
            java.io.File f = new java.io.File(call.getString("path", "")).getCanonicalFile();
            // only inside the app's podcast folder
            if (f.getPath().startsWith(new java.io.File(getContext().getFilesDir(), "podcasts").getCanonicalPath() + "/")) f.delete();
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void listSounds(PluginCall call) {
        try {
            JSObject out = new JSObject();
            out.put("sounds", FocusNative.list(getContext()));
            call.resolve(out);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void playSound(PluginCall call) {
        FocusNative.playPreview(getContext(), call.getString("uri", ""));
        call.resolve();
    }

    @PluginMethod
    public void soundPlaying(PluginCall call) {
        JSObject out = new JSObject();
        out.put("playing", FocusNative.previewPlaying());
        call.resolve(out);
    }

    @PluginMethod
    public void stopSound(PluginCall call) {
        FocusNative.stopPreview();
        call.resolve();
    }

    /** Keep the screen on (zen mode). */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        if (getActivity() != null) getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    @PluginMethod
    public void overlayReady(PluginCall call) {
        if (getActivity() instanceof OverlayActivity) ((OverlayActivity) getActivity()).reveal();
        call.resolve();
    }

    @PluginMethod
    public void pinWidget(PluginCall call) {
        Context ctx = getContext();
        JSObject out = new JSObject();
        boolean ok = false;
        if (Build.VERSION.SDK_INT >= 26) {
            AppWidgetManager m = AppWidgetManager.getInstance(ctx);
            if (m.isRequestPinAppWidgetSupported()) ok = m.requestPinAppWidget(new ComponentName(ctx, DayloopWidget.class), null, null);
        }
        out.put("supported", ok);
        call.resolve(out);
    }
}
