package com.dayloop.app;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);
        claimLeftEdge();
        keepRoute(getIntent());
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        keepRoute(intent);
    }

    /** The widget opens the app on the page it was showing; the web layer picks the route up when it becomes visible. */
    private void keepRoute(android.content.Intent intent) {
        String route = intent == null ? null : intent.getStringExtra("route");
        if (route != null) WidgetStore.setRoute(this, route);
    }

    /** Keep a strip of the left edge away from the system back gesture so the in-app menu swipe works there. */
    private void claimLeftEdge() {
        if (Build.VERSION.SDK_INT < 29) return;
        final View decor = getWindow().getDecorView();
        final float d = getResources().getDisplayMetrics().density;
        decor.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            int h = b - t;
            int band = (int) (200 * d);
            int top = Math.max(0, (int) (h * 0.35f));
            v.setSystemGestureExclusionRects(Collections.singletonList(new Rect(0, top, (int) (40 * d), Math.min(h, top + band))));
        });
    }
}
