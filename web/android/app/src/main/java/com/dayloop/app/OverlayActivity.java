package com.dayloop.app;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** The app's web UI in a translucent window: bottom sheets (task, new item) float over the home screen. */
public class OverlayActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // Capacitor re-applies the opaque app theme: make the window see-through again
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
        getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        // hidden until the overlay route has rendered: the initial load shows the normal app for a moment
        getBridge().getWebView().setAlpha(0f);
        getBridge().getWebView().postDelayed(this::reveal, 2500);
        go(getIntent());
    }

    /** Capacitor switches to the opaque app theme in onCreate; keep the translucent one so the home screen shows through. */
    @Override
    public void setTheme(int resid) {
        super.setTheme(R.style.AppTheme_Overlay);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        go(intent);
    }

    private void go(Intent intent) {
        Uri d = intent.getData();
        String path = d != null && d.getPath() != null ? d.getPath() : "";
        final String url = "https://localhost/#/overlay" + path;
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
    }

    public void reveal() {
        runOnUiThread(() -> getBridge().getWebView().setAlpha(1f));
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(0, 0);
    }
}
