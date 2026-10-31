package com.dayloop.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Invisible trampoline for list item taps: "toggle" runs the action in the background, "open" shows the overlay. */
public class WidgetRouterActivity extends Activity {
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Intent in = getIntent();
        String op = in.getStringExtra("op"), id = in.getStringExtra("id");
        if (id != null && "toggle".equals(op)) {
            sendBroadcast(new Intent(this, DayloopWidget.class).setAction(DayloopWidget.ACTION_TOGGLE)
                .putExtra("id", id).putExtra("done", in.getBooleanExtra("done", true)).putExtra("rep", in.getBooleanExtra("rep", false)));
        } else if (id != null && "open".equals(op)) {
            startActivity(DayloopWidget.overlayIntent(this, "task/" + id));
        } else if (id != null && "track".equals(op)) {
            startActivity(DayloopWidget.overlayIntent(this, "track/" + id));
        } else if ("app".equals(op)) {
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch != null) startActivity(launch);
        }
        finish();
        overridePendingTransition(0, 0);
    }
}
