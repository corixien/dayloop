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
