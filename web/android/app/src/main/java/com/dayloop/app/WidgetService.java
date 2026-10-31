package com.dayloop.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.util.TypedValue;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

/** Feeds the widget list with the rows of the snapshot (headers and tasks). */
public class WidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(), intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID));
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private final int widgetId;
        private JSONArray rows = new JSONArray();

        Factory(Context ctx, int widgetId) { this.ctx = ctx; this.widgetId = widgetId; }

        @Override public void onCreate() {}
        @Override public void onDestroy() {}
        @Override public void onDataSetChanged() { rows = WidgetStore.rows(ctx, WidgetStore.mode(ctx, widgetId)); }
        @Override public int getCount() { return rows.length(); }
        @Override public int getViewTypeCount() { return 2; }
        @Override public boolean hasStableIds() { return false; }
        @Override public long getItemId(int position) { return position; }
        @Override public RemoteViews getLoadingView() { return null; }

        @Override
        public RemoteViews getViewAt(int position) {
            WidgetStore.Cfg cfg = WidgetStore.cfg(ctx, widgetId);
            int bg = WidgetStore.bgColor(ctx, cfg);
            int text = WidgetStore.textColor(bg), muted = WidgetStore.mutedColor(bg);
            JSONObject r = rows.optJSONObject(position);
            if (r == null) return new RemoteViews(ctx.getPackageName(), R.layout.widget_header);

            if ("h".equals(r.optString("k"))) {
                RemoteViews h = new RemoteViews(ctx.getPackageName(), R.layout.widget_header);
                h.setTextViewText(R.id.header, r.optString("title").toUpperCase());
                h.setTextColor(R.id.header, muted);
                h.setTextViewTextSize(R.id.header, TypedValue.COMPLEX_UNIT_SP, cfg.headerSp());
                return h;
            }

            boolean doneMode = WidgetStore.mode(ctx, widgetId) == 1;
            String id = r.optString("id");
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
            v.setTextViewText(R.id.title, r.optString("title"));
            v.setTextViewTextSize(R.id.title, TypedValue.COMPLEX_UNIT_SP, cfg.titleSp());
            v.setTextColor(R.id.title, doneMode ? muted : text);

            String meta = r.optString("meta");
            v.setViewVisibility(R.id.meta, meta.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
            v.setTextViewText(R.id.meta, meta);
            v.setTextViewTextSize(R.id.meta, TypedValue.COMPLEX_UNIT_SP, cfg.metaSp());
            v.setTextColor(R.id.meta, muted);

            int prio = r.optInt("prio", 0);
            int tint = doneMode ? muted : prio == 3 ? 0xFFE5484D : prio == 2 ? 0xFFE5930B : prio == 1 ? 0xFF3E63DD : muted;
            v.setImageViewResource(R.id.check, doneMode ? R.drawable.widget_check_on : R.drawable.widget_check_off);
            v.setInt(R.id.check, "setColorFilter", tint);

            Intent toggle = new Intent().putExtra("op", "toggle").putExtra("id", id).putExtra("done", !doneMode).putExtra("rep", r.optBoolean("rep", false));
            v.setOnClickFillInIntent(R.id.check, toggle);
            Intent open = new Intent().putExtra("op", "open").putExtra("id", id);
            v.setOnClickFillInIntent(R.id.body, open);
            return v;
        }
    }
}
