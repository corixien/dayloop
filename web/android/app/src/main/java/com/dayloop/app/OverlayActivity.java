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
        getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        go(getIntent());
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

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(0, 0);
    }
}
