package com.dayloop.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** Home screen widget: Todo and Have Done lists with checkboxes, a plus button and per-widget settings. */
public class DayloopWidget extends AppWidgetProvider {
    static final String ACTION_TAB = "com.dayloop.app.WIDGET_TAB";
    static final String ACTION_TOGGLE = "com.dayloop.app.WIDGET_TOGGLE";

    private static final int[] RADIUS_BG = {R.drawable.widget_bg_r0, R.drawable.widget_bg_r16, R.drawable.widget_bg_r28};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, android.os.Bundle opts) {
        render(ctx, mgr, id);
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        for (int id : ids) WidgetStore.deleteCfg(ctx, id);
    }

    @Override
    public void onReceive(final Context ctx, Intent intent) {
        String action = intent.getAction();
        if (ACTION_TAB.equals(action)) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                WidgetStore.setMode(ctx, id, intent.getIntExtra("mode", 0));
                refresh(ctx, id);
            }
            return;
        }
        if (ACTION_TOGGLE.equals(action)) {
            final String taskId = intent.getStringExtra("id");
            final boolean done = intent.getBooleanExtra("done", true);
            final boolean rep = intent.getBooleanExtra("rep", false);
            if (taskId == null) return;
            final PendingResult pr = goAsync();
            new Thread(() -> {
                try {
                    long at = System.currentTimeMillis();
                    WidgetStore.applyToggle(ctx, taskId, done, at);
                    refreshAll(ctx);
                    // repeating todos must roll their deadline forward: the app does that, so only queue them
                    boolean pushed = !rep && WidgetStore.pushDone(ctx, taskId, done, at);
                    if (!pushed) WidgetStore.addPending(ctx, taskId, done, at);
                } finally {
                    pr.finish();
                }
            }).start();
            return;
        }
        super.onReceive(ctx, intent);
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, DayloopWidget.class))) refresh(ctx, id);
    }

    static void refresh(Context ctx, int id) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        render(ctx, mgr, id);
        mgr.notifyAppWidgetViewDataChanged(id, R.id.list);
    }

    static void render(Context ctx, AppWidgetManager mgr, int id) {
        WidgetStore.Cfg cfg = WidgetStore.cfg(ctx, id);
        int mode = WidgetStore.mode(ctx, id);
        JSONObject snap = WidgetStore.snapshot(ctx);
        JSONObject labels = snap.optJSONObject("labels");
        String lTodo = labels != null ? labels.optString("todo", "Todo") : "Todo";
        String lDone = labels != null ? labels.optString("done", "Have Done") : "Have Done";
        String lEmpty = labels != null ? labels.optString(mode == 0 ? "empty" : "emptyDone", "") : "";

        int bg = WidgetStore.bgColor(ctx, cfg);
        int text = WidgetStore.textColor(bg), muted = WidgetStore.mutedColor(bg);
        boolean night = WidgetStore.night(ctx);
        int accent = night ? 0xFF8A87F5 : 0xFF5B5BD6;

        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_main);
        v.setImageViewResource(R.id.bg, RADIUS_BG[Math.max(0, Math.min(2, cfg.radius))]);
        v.setInt(R.id.bg, "setColorFilter", bg);
        v.setInt(R.id.bg, "setImageAlpha", Math.round(255f * Math.max(30, Math.min(100, cfg.alpha)) / 100f));

        // tabs
        float tabSp = cfg.titleSp() - 1;
        v.setTextViewText(R.id.tab_todo, lTodo);
        v.setTextViewText(R.id.tab_done, lDone);
        v.setTextViewTextSize(R.id.tab_todo, TypedValue.COMPLEX_UNIT_SP, tabSp);
        v.setTextViewTextSize(R.id.tab_done, TypedValue.COMPLEX_UNIT_SP, tabSp);
        v.setInt(R.id.tab_todo, "setBackgroundResource", mode == 0 ? R.drawable.widget_tab_active : 0);
        v.setInt(R.id.tab_done, "setBackgroundResource", mode == 1 ? R.drawable.widget_tab_active : 0);
        v.setTextColor(R.id.tab_todo, mode == 0 ? 0xFFFFFFFF : muted);
        v.setTextColor(R.id.tab_done, mode == 1 ? 0xFFFFFFFF : muted);
        v.setOnClickPendingIntent(R.id.tab_todo, tabIntent(ctx, id, 0));
        v.setOnClickPendingIntent(R.id.tab_done, tabIntent(ctx, id, 1));

        // plus
        v.setViewVisibility(R.id.plus, cfg.plus ? View.VISIBLE : View.GONE);
        if (cfg.plus) {
            Intent add = overlayIntent(ctx, "new/" + (mode == 0 ? "todo" : "done"));
            v.setOnClickPendingIntent(R.id.plus, PendingIntent.getActivity(ctx, id * 10 + 1, add, flags(false)));
        }

        // list
        Intent svc = new Intent(ctx, WidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.list, svc);
        v.setEmptyView(R.id.list, R.id.empty);
        v.setTextViewText(R.id.empty, lEmpty);
        v.setTextColor(R.id.empty, muted);
        v.setTextViewTextSize(R.id.empty, TypedValue.COMPLEX_UNIT_SP, cfg.titleSp());

        // taps on the background or the empty text open the app
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch != null) {
            PendingIntent open = PendingIntent.getActivity(ctx, id * 10 + 5, launch, flags(false));
            v.setOnClickPendingIntent(R.id.root, open);
            v.setOnClickPendingIntent(R.id.empty, open);
        }

        Intent tmpl = new Intent(ctx, WidgetRouterActivity.class);
        v.setPendingIntentTemplate(R.id.list, PendingIntent.getActivity(ctx, id * 10 + 2, tmpl, flags(true)));

        mgr.updateAppWidget(id, v);
    }

    static Intent overlayIntent(Context ctx, String path) {
        Intent i = new Intent(ctx, OverlayActivity.class);
        i.setData(Uri.parse("dayloop://overlay/" + path));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return i;
    }

    private static PendingIntent tabIntent(Context ctx, int id, int mode) {
        Intent i = new Intent(ctx, DayloopWidget.class).setAction(ACTION_TAB)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra("mode", mode);
        return PendingIntent.getBroadcast(ctx, id * 10 + 3 + mode, i, flags(false));
    }

    static int flags(boolean mutable) {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (mutable) { if (Build.VERSION.SDK_INT >= 31) f |= PendingIntent.FLAG_MUTABLE; }
        else f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }
}
