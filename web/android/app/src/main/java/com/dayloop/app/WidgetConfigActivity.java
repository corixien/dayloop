package com.dayloop.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

/** Widget settings (shown when adding the widget and on long-press > settings): look, font size, default view. */
public class WidgetConfigActivity extends Activity {
    private static final int[] SWATCHES = {0, 0xFFFFFF, 0xF4F4F6, 0xE9E9FB, 0x1A1A1E, 0x000000, 0x5B5BD6, 0x30A46C, 0x0E7490, 0xE5484D, 0xF5A524, 0x7C3AED};
    private static final String[] SWATCH_NAMES = {"Auto", "Weiß", "Hellgrau", "Lavendel", "Anthrazit", "Schwarz", "Indigo", "Grün", "Petrol", "Rot", "Orange", "Violett"};

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private WidgetStore.Cfg cfg;
    private boolean night;
    private int pageBg, card, ink, sub, line, accent;
    private LinearLayout previewBox;
    private LinearLayout swatchRow;
    private EditText hex;

    private float dp(float v) { return v * getResources().getDisplayMetrics().density; }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        setResult(RESULT_CANCELED, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }

        night = WidgetStore.night(this);
        pageBg = night ? 0xFF101012 : 0xFFF6F6F8;
        card = night ? 0xFF1A1A1E : 0xFFFFFFFF;
        ink = night ? 0xFFECECF0 : 0xFF1C1C21;
        sub = night ? 0xFF8D8D98 : 0xFF6B6B76;
        line = night ? 0xFF28282E : 0xFFE6E6EB;
        accent = night ? 0xFF8A87F5 : 0xFF5B5BD6;
        cfg = WidgetStore.cfg(this, widgetId);

        Window w = getWindow();
        w.setStatusBarColor(pageBg);
        w.setNavigationBarColor(pageBg);
        w.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 23 && !night) w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(pageBg);

        TextView title = text("Widget-Einstellungen", 20, ink, true);
        title.setPadding((int) dp(20), (int) dp(48), (int) dp(20), (int) dp(12));
        root.addView(title);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding((int) dp(16), 0, (int) dp(16), (int) dp(24));
        scroll.addView(col);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1f));

        // live preview
        previewBox = new LinearLayout(this);
        previewBox.setOrientation(LinearLayout.VERTICAL);
        previewBox.setPadding((int) dp(14), (int) dp(12), (int) dp(14), (int) dp(12));
        col.addView(previewBox, lp(0, 0, 0, 12));

        // background
        LinearLayout bgCard = section(col, "Hintergrund");
        swatchRow = new LinearLayout(this);
        swatchRow.setOrientation(LinearLayout.VERTICAL);
        bgCard.addView(swatchRow);
        buildSwatches();
        hex = new EditText(this);
        hex.setHint("Eigene Farbe, z. B. #5B5BD6");
        hex.setHintTextColor(sub);
        hex.setTextColor(ink);
        hex.setTextSize(14);
        hex.setSingleLine(true);
        hex.setBackground(rounded(night ? 0xFF222227 : 0xFFF1F1F4, 10, 0, 0));
        hex.setPadding((int) dp(12), (int) dp(10), (int) dp(12), (int) dp(10));
        hex.setText(cfg.bg == 0 ? "" : String.format("#%06X", cfg.bg));
        hex.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int c, int d) {}
            public void onTextChanged(CharSequence s, int a, int c, int d) {}
            public void afterTextChanged(Editable e) {
                String t = e.toString().trim();
                if (t.matches("#?[0-9a-fA-F]{6}")) {
                    cfg.bg = Integer.parseInt(t.replace("#", ""), 16) & 0xFFFFFF;
                    if (cfg.bg == 0) cfg.bg = 0x000001;
                    buildSwatches();
                    preview();
                }
            }
        });
        bgCard.addView(hex, lp(0, 10, 0, 0));
        bgCard.addView(label("Deckkraft"), lp(0, 14, 0, 4));
        SeekBar alpha = new SeekBar(this);
        alpha.setMax(70);
        alpha.setProgress(cfg.alpha - 30);
        alpha.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar s, int p, boolean u) { cfg.alpha = 30 + p; preview(); }
            public void onStartTrackingTouch(SeekBar s) {}
            public void onStopTrackingTouch(SeekBar s) {}
        });
        bgCard.addView(alpha);

        // shape
        LinearLayout shape = section(col, "Ecken");
        shape.addView(segmented(new String[]{"Eckig", "Rund", "Sehr rund"}, cfg.radius, i -> { cfg.radius = i; preview(); }));

        // font
        LinearLayout font = section(col, "Schriftgröße");
        font.addView(segmented(new String[]{"S", "M", "L", "XL"}, cfg.size, i -> { cfg.size = i; preview(); }));

        // default view
        LinearLayout view = section(col, "Standardansicht");
        view.addView(segmented(new String[]{"Todo", "Have Done"}, cfg.tab, i -> { cfg.tab = i; preview(); }));

        // plus
        LinearLayout plusCard = section(col, "Plus-Button");
        LinearLayout plusRow = new LinearLayout(this);
        plusRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView pt = text("Oben rechts anzeigen", 15, ink, false);
        plusRow.addView(pt, new LinearLayout.LayoutParams(0, -2, 1f));
        Switch sw = new Switch(this);
        sw.setChecked(cfg.plus);
        sw.setOnCheckedChangeListener((CompoundButton v, boolean on) -> { cfg.plus = on; preview(); });
        plusRow.addView(sw);
        plusCard.addView(plusRow);

        // actions
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding((int) dp(16), (int) dp(10), (int) dp(16), (int) dp(16));
        bar.setBackgroundColor(pageBg);
        TextView cancel = button("Abbrechen", false);
        cancel.setOnClickListener(v -> finish());
        TextView save = button("Fertig", true);
        save.setOnClickListener(v -> save());
        bar.addView(cancel, new LinearLayout.LayoutParams(0, (int) dp(48), 1f));
        View gap = new View(this);
        bar.addView(gap, new LinearLayout.LayoutParams((int) dp(10), 1));
        bar.addView(save, new LinearLayout.LayoutParams(0, (int) dp(48), 1.4f));
        root.addView(bar);

        setContentView(root);
        preview();
    }

    private void save() {
        WidgetStore.saveCfg(this, widgetId, cfg);
        WidgetStore.setMode(this, widgetId, cfg.tab);
        DayloopWidget.refresh(this, widgetId);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }

    // ---- preview ----

    private void preview() {
        previewBox.removeAllViews();
        int bg = WidgetStore.bgColor(this, cfg);
        int a = Math.round(255f * cfg.alpha / 100f);
        int bgA = (a << 24) | (bg & 0xFFFFFF);
        float r = new float[]{0f, 16f, 28f}[cfg.radius];
        previewBox.setBackground(rounded(bgA, r, 1, line));
        int text = WidgetStore.textColor(bg), muted = WidgetStore.mutedColor(bg);

        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView t1 = pill(cfg.tab == 0 ? "Todo" : "Todo", cfg.tab == 0, muted);
        TextView t2 = pill("Have Done", cfg.tab == 1, muted);
        head.addView(t1);
        head.addView(t2);
        View sp = new View(this);
        head.addView(sp, new LinearLayout.LayoutParams(0, 1, 1f));
        if (cfg.plus) {
            TextView plus = new TextView(this);
            plus.setText("+");
            plus.setTextColor(Color.WHITE);
            plus.setTextSize(22);
            plus.setGravity(Gravity.CENTER);
            plus.setBackground(oval(0xFF5B5BD6));
            head.addView(plus, new LinearLayout.LayoutParams((int) dp(36), (int) dp(36)));
        }
        previewBox.addView(head, lp(0, 0, 0, 8));

        String[][] rows = cfg.tab == 0
            ? new String[][]{{"Zahnarzt", "Heute 15:00"}, {"Referat abgeben", "Morgen"}, {"Milch kaufen", ""}}
            : new String[][]{{"Mathe gelernt", "09:05"}, {"Sport gemacht", "08:10"}};
        for (String[] row : rows) {
            LinearLayout line1 = new LinearLayout(this);
            line1.setGravity(Gravity.CENTER_VERTICAL);
            View circle = new View(this);
            GradientDrawable ring = new GradientDrawable();
            ring.setShape(GradientDrawable.OVAL);
            ring.setStroke((int) dp(2), cfg.tab == 0 ? muted : accent);
            if (cfg.tab == 1) ring.setColor(accent);
            circle.setBackground(ring);
            line1.addView(circle, new LinearLayout.LayoutParams((int) dp(20), (int) dp(20)));
            LinearLayout txt = new LinearLayout(this);
            txt.setOrientation(LinearLayout.VERTICAL);
            txt.setPadding((int) dp(12), (int) dp(8), 0, (int) dp(8));
            TextView tt = text(row[0], cfg.titleSp(), cfg.tab == 1 ? muted : text, false);
            txt.addView(tt);
            if (!row[1].isEmpty()) txt.addView(text(row[1], cfg.metaSp(), muted, false));
            line1.addView(txt);
            previewBox.addView(line1);
        }
    }

    private TextView pill(String s, boolean active, int muted) {
        TextView t = text(s, cfg.titleSp() - 1, active ? Color.WHITE : muted, true);
        t.setPadding((int) dp(12), (int) dp(6), (int) dp(12), (int) dp(6));
        if (active) t.setBackground(rounded(0xFF5B5BD6, 16, 0, 0));
        return t;
    }

    // ---- building blocks ----

    private void buildSwatches() {
        swatchRow.removeAllViews();
        LinearLayout rowL = null;
        for (int i = 0; i < SWATCHES.length; i++) {
            if (i % 6 == 0) {
                rowL = new LinearLayout(this);
                rowL.setOrientation(LinearLayout.HORIZONTAL);
                swatchRow.addView(rowL, lp(0, i == 0 ? 0 : 8, 0, 0));
            }
            final int color = SWATCHES[i];
            boolean selected = cfg.bg == color;
            FrameLayout cell = new FrameLayout(this);
            View dot = new View(this);
            GradientDrawable d = new GradientDrawable();
            d.setShape(GradientDrawable.OVAL);
            d.setColor(color == 0 ? (night ? 0xFF1A1A1E : 0xFFFFFFFF) : 0xFF000000 | color);
            d.setStroke((int) dp(selected ? 3 : 1), selected ? accent : line);
            dot.setBackground(d);
            FrameLayout.LayoutParams dlp = new FrameLayout.LayoutParams((int) dp(40), (int) dp(40), Gravity.CENTER);
            cell.addView(dot, dlp);
            if (color == 0) {
                TextView a = text("A", 14, ink, true);
                a.setGravity(Gravity.CENTER);
                cell.addView(a, new FrameLayout.LayoutParams((int) dp(40), (int) dp(40), Gravity.CENTER));
            }
            cell.setContentDescription(SWATCH_NAMES[i]);
            cell.setOnClickListener(v -> {
                cfg.bg = color;
                if (hex != null) hex.setText(color == 0 ? "" : String.format("#%06X", color));
                buildSwatches();
                preview();
            });
            rowL.addView(cell, new LinearLayout.LayoutParams(0, (int) dp(46), 1f));
        }
    }

    private interface Pick { void on(int i); }

    private View segmented(String[] names, int selected, Pick pick) {
        final LinearLayout row = new LinearLayout(this);
        row.setBackground(rounded(night ? 0xFF222227 : 0xFFF1F1F4, 12, 0, 0));
        row.setPadding((int) dp(3), (int) dp(3), (int) dp(3), (int) dp(3));
        final TextView[] cells = new TextView[names.length];
        for (int i = 0; i < names.length; i++) {
            final int idx = i;
            TextView t = text(names[i], 14, ink, true);
            t.setGravity(Gravity.CENTER);
            t.setPadding(0, (int) dp(10), 0, (int) dp(10));
            cells[i] = t;
            t.setOnClickListener(v -> {
                for (int k = 0; k < cells.length; k++) style(cells[k], k == idx);
                pick.on(idx);
            });
            row.addView(t, new LinearLayout.LayoutParams(0, -2, 1f));
        }
        for (int k = 0; k < cells.length; k++) style(cells[k], k == selected);
        return row;
    }

    private void style(TextView t, boolean on) {
        t.setBackground(on ? rounded(card, 10, 0, 0) : null);
        t.setTextColor(on ? accent : sub);
    }

    private LinearLayout section(LinearLayout parent, String name) {
        TextView l = label(name);
        parent.addView(l, lp(4, 16, 0, 6));
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding((int) dp(14), (int) dp(14), (int) dp(14), (int) dp(14));
        c.setBackground(rounded(card, 16, 1, line));
        parent.addView(c, lp(0, 0, 0, 0));
        return c;
    }

    private TextView label(String s) { return text(s, 12, sub, true); }

    private TextView button(String s, boolean primary) {
        TextView t = text(s, 15, primary ? Color.WHITE : ink, true);
        t.setGravity(Gravity.CENTER);
        t.setBackground(primary ? rounded(0xFF5B5BD6, 14, 0, 0) : rounded(card, 14, 1, line));
        return t;
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private GradientDrawable rounded(int color, float radiusDp, int strokeDp, int stroke) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        if (strokeDp > 0) d.setStroke((int) dp(strokeDp), stroke);
        return d;
    }

    private GradientDrawable oval(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(color);
        return d;
    }

    private LinearLayout.LayoutParams lp(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins((int) dp(l), (int) dp(t), (int) dp(r), (int) dp(b));
        return p;
    }
}
