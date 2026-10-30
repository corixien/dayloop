package com.dayloop.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives a snapshot of today's tasks from the web layer and refreshes the home screen widget. */
@CapacitorPlugin(name = "DayloopWidget")
public class WidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        JSObject data = call.getData();
        ctx.getSharedPreferences(TodayWidget.PREFS, Context.MODE_PRIVATE).edit().putString("data", data.toString()).apply();
        Intent i = new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        i.setComponent(new ComponentName(ctx, TodayWidget.class));
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS,
            AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, TodayWidget.class)));
        ctx.sendBroadcast(i);
        call.resolve();
    }
}
