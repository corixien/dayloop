package com.dayloop.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** "Heute" widget: title, up to six open tasks, overflow count. Tap opens the app. */
public class TodayWidget extends AppWidgetProvider {
    static final String PREFS = "dayloop_widget";
    private static final int[] ROWS = {R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5, R.id.row6};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", null);
        String title = ctx.getString(R.string.widget_title);
        JSONArray items = new JSONArray();
        int more = 0;
        try {
            if (raw != null) {
                JSONObject o = new JSONObject(raw);
                title = o.optString("title", title);
                items = o.optJSONArray("items") != null ? o.optJSONArray("items") : items;
                more = o.optInt("more", 0);
            }
        } catch (Exception ignored) {}

        Intent open = new Intent(ctx, MainActivity.class);
        PendingIntent tap = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);
            v.setTextViewText(R.id.title, title);
            for (int i = 0; i < ROWS.length; i++) {
                if (i < items.length()) {
                    v.setTextViewText(ROWS[i], items.optString(i));
                    v.setViewVisibility(ROWS[i], android.view.View.VISIBLE);
                } else {
                    v.setViewVisibility(ROWS[i], android.view.View.GONE);
                }
            }
            v.setViewVisibility(R.id.empty, items.length() == 0 ? android.view.View.VISIBLE : android.view.View.GONE);
            v.setViewVisibility(R.id.more, more > 0 ? android.view.View.VISIBLE : android.view.View.GONE);
            v.setTextViewText(R.id.more, "+" + more);
            v.setOnClickPendingIntent(R.id.root, tap);
            mgr.updateAppWidget(id, v);
        }
    }
}
