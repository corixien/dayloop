package com.dayloop.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Everything the home screen widget persists: data snapshot, pending actions, credentials, per-widget settings. */
final class WidgetStore {
    static final String PREFS = "dayloop_widget";

    /** Per-widget look and behavior. bg == 0 follows the system light/dark mode. */
    static final class Cfg {
        int bg = 0;          // 0xRRGGBB, 0 = auto
        int alpha = 100;     // 30..100 (%)
        int radius = 1;      // 0 square, 1 round, 2 very round
        int size = 1;        // 0 S, 1 M, 2 L, 3 XL
        boolean plus = true;
        int tab = 0;         // default view: 0 Todo, 1 Have Done

        float titleSp() { return new float[]{14f, 16f, 18f, 20f}[size]; }
        float metaSp() { return new float[]{11f, 12f, 13f, 14f}[size]; }
        float headerSp() { return new float[]{11f, 12f, 12f, 13f}[size]; }
    }

    private WidgetStore() {}

    static SharedPreferences p(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean night(Context c) {
        return (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    // ---- per-widget settings ----

    static Cfg cfg(Context c, int id) {
        SharedPreferences p = p(c);
        Cfg g = new Cfg();
        g.bg = p.getInt(id + "_bg", g.bg);
        g.alpha = p.getInt(id + "_alpha", g.alpha);
        g.radius = p.getInt(id + "_radius", g.radius);
        g.size = p.getInt(id + "_size", g.size);
        g.plus = p.getBoolean(id + "_plus", g.plus);
        g.tab = p.getInt(id + "_tab", g.tab);
        return g;
    }

    static void saveCfg(Context c, int id, Cfg g) {
        p(c).edit().putInt(id + "_bg", g.bg).putInt(id + "_alpha", g.alpha).putInt(id + "_radius", g.radius)
            .putInt(id + "_size", g.size).putBoolean(id + "_plus", g.plus).putInt(id + "_tab", g.tab)
            .putInt(id + "_mode", g.tab).apply();
    }

    static int mode(Context c, int id) {
        return p(c).getInt(id + "_mode", cfg(c, id).tab);
    }

    static void setMode(Context c, int id, int mode) {
        p(c).edit().putInt(id + "_mode", mode).apply();
    }

    static void deleteCfg(Context c, int id) {
        SharedPreferences.Editor e = p(c).edit();
        for (String k : new String[]{"_bg", "_alpha", "_radius", "_size", "_plus", "_tab", "_mode"}) e.remove(id + k);
        e.apply();
    }

    // ---- colors ----

    static int bgColor(Context c, Cfg g) {
        return g.bg == 0 ? (night(c) ? 0xFF1A1A1E : 0xFFFFFFFF) : 0xFF000000 | g.bg;
    }

    static boolean isLight(int color) {
        double r = ((color >> 16) & 0xFF) / 255.0, gr = ((color >> 8) & 0xFF) / 255.0, b = (color & 0xFF) / 255.0;
        return 0.2126 * r + 0.7152 * gr + 0.0722 * b > 0.55;
    }

    static int textColor(int bg) { return isLight(bg) ? 0xFF1C1C21 : 0xFFECECF0; }
    static int mutedColor(int bg) { return isLight(bg) ? 0xFF6B6B76 : 0xFF9A9AA6; }

    // ---- snapshot ----

    static JSONObject snapshot(Context c) {
        try {
            String raw = p(c).getString("data", null);
            if (raw != null) return new JSONObject(raw);
        } catch (JSONException ignored) { }
        try {
            return new JSONObject("{\"lang\":\"de\",\"labels\":{\"today\":\"Heute\",\"none\":\"Ohne Deadline\",\"todo\":\"Todo\",\"done\":\"Have Done\",\"empty\":\"Keine offenen Aufgaben\",\"emptyDone\":\"Noch nichts erledigt\"},\"todo\":[],\"done\":[]}");
        } catch (JSONException e) { return new JSONObject(); }
    }

    static void saveSnapshot(Context c, JSONObject o) {
        p(c).edit().putString("data", o.toString()).apply();
    }

    static JSONArray rows(Context c, int mode) {
        JSONArray a = snapshot(c).optJSONArray(mode == 0 ? "todo" : "done");
        return a != null ? a : new JSONArray();
    }

    /** Move a row between the lists right away so the widget reacts before the app or server catch up. */
    static void applyToggle(Context c, String id, boolean done, long at) {
        try {
            JSONObject s = snapshot(c);
            JSONObject labels = s.optJSONObject("labels");
            String today = labels != null ? labels.optString("today", "Heute") : "Heute";
            String none = labels != null ? labels.optString("none", "Ohne Deadline") : "Ohne Deadline";
            JSONArray todo = s.optJSONArray("todo"), doneList = s.optJSONArray("done");
            if (todo == null) todo = new JSONArray();
            if (doneList == null) doneList = new JSONArray();

            JSONArray source = done ? todo : doneList, target = done ? doneList : todo, rest = new JSONArray();
            JSONObject moved = null;
            for (int i = 0; i < source.length(); i++) {
                JSONObject r = source.getJSONObject(i);
                if (moved == null && "t".equals(r.optString("k")) && id.equals(r.optString("id"))) moved = r; else rest.put(r);
            }
            if (moved == null) return;
            rest = dropEmptyHeaders(rest);

            JSONObject row = new JSONObject(moved.toString());
            JSONArray out = new JSONArray();
            if (done) {
                row.put("meta", new java.text.SimpleDateFormat("HH:mm", java.util.Locale.GERMANY).format(new java.util.Date(at)));
                boolean firstIsToday = target.length() > 0 && "h".equals(target.getJSONObject(0).optString("k"))
                    && today.equals(target.getJSONObject(0).optString("title"));
                if (firstIsToday) out.put(target.get(0)); else out.put(new JSONObject().put("k", "h").put("title", today));
                out.put(row);
                for (int i = firstIsToday ? 1 : 0; i < target.length(); i++) out.put(target.get(i));
            } else {
                row.put("meta", "");
                boolean hasNone = false;
                for (int i = 0; i < target.length(); i++) {
                    JSONObject r = target.getJSONObject(i);
                    out.put(r);
                    if ("h".equals(r.optString("k")) && none.equals(r.optString("title"))) hasNone = true;
                }
                if (!hasNone) out.put(new JSONObject().put("k", "h").put("title", none));
                out.put(row);
            }
            s.put(done ? "todo" : "done", rest);
            s.put(done ? "done" : "todo", out);
            saveSnapshot(c, s);
        } catch (JSONException ignored) { }
    }

    private static JSONArray dropEmptyHeaders(JSONArray a) throws JSONException {
        JSONArray out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject r = a.getJSONObject(i);
            if ("h".equals(r.optString("k"))) {
                boolean hasTask = i + 1 < a.length() && "t".equals(a.getJSONObject(i + 1).optString("k"));
                if (!hasTask) continue;
            }
            out.put(r);
        }
        return out;
    }

    // ---- pending actions (applied by the app, or pushed to the server) ----

    static synchronized JSONArray pending(Context c) {
        try { return new JSONArray(p(c).getString("pending", "[]")); } catch (JSONException e) { return new JSONArray(); }
    }

    static synchronized void addPending(Context c, String id, boolean done, long at) {
        try {
            JSONArray a = pending(c), out = new JSONArray();
            for (int i = 0; i < a.length(); i++) if (!id.equals(a.getJSONObject(i).optString("id"))) out.put(a.get(i));
            out.put(new JSONObject().put("id", id).put("done", done).put("at", at));
            p(c).edit().putString("pending", out.toString()).apply();
        } catch (JSONException ignored) { }
    }

    static synchronized JSONArray takePending(Context c) {
        JSONArray a = pending(c);
        p(c).edit().putString("pending", "[]").apply();
        return a;
    }

    static synchronized void removePending(Context c, String id, long at) {
        try {
            JSONArray a = pending(c), out = new JSONArray();
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                if (!(id.equals(o.optString("id")) && o.optLong("at") == at)) out.put(o);
            }
            p(c).edit().putString("pending", out.toString()).apply();
        } catch (JSONException ignored) { }
    }

    // ---- server access (API token created by the app for the widget) ----

    static void setCredentials(Context c, String url, String token) {
        p(c).edit().putString("url", url).putString("token", token).apply();
    }

    static boolean hasCredentials(Context c) {
        return !p(c).getString("url", "").isEmpty() && !p(c).getString("token", "").isEmpty();
    }

    /** PATCH done/undone to the server. Returns true when the server took it (or the task no longer exists). */
    static boolean pushDone(Context c, String id, boolean done, long at) {
        String url = p(c).getString("url", ""), token = p(c).getString("token", "");
        if (url.isEmpty() || token.isEmpty()) return false;
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(url + "/api/items/task/" + id).openConnection();
            con.setRequestMethod("POST");
            con.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            con.setConnectTimeout(15000);
            con.setReadTimeout(45000); // Render free tier wakes up slowly
            con.setRequestProperty("Authorization", "Bearer " + token);
            con.setRequestProperty("Content-Type", "application/json");
            con.setDoOutput(true);
            JSONObject data = new JSONObject().put("done", done).put("completedAt", done ? (Object) at : JSONObject.NULL);
            byte[] body = new JSONObject().put("data", data).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = con.getOutputStream()) { os.write(body); }
            int code = con.getResponseCode();
            return (code >= 200 && code < 300) || code == 404;
        } catch (Exception e) {
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }
}
