import { createServer } from "node:http";
import { expect, test } from "@playwright/test";

const shot = (page: any, name: string) => page.screenshot({ path: `e2e/shots/${name}.png` });

async function swipe(page: any, from: [number, number], to: [number, number], steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x: number, y: number) => [{ x, y }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(...from) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Minimal stand-in for the Productivity-Tracker API (login, AI rating, create, complete). */
async function addVia(page: any, kind: "todo" | "done", text: string) {
  await page.getByRole("button", { name: kind === "todo" ? "Neue Aufgabe" : "Erledigtes eintragen" }).click();
  await page.locator("[data-newtitle]").fill(text);
  await page.locator("[data-newtitle]").press("Enter");
  await page.waitForTimeout(450);
}

function fakeTracker() {
  const seen: { path: string; body: any }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Timezone");
      res.setHeader("Content-Type", "application/json");
      if (req.method === "OPTIONS") return void res.writeHead(204).end();
      seen.push({ path: req.url!, body });
      if (req.url === "/api/auth/login") return void res.end(JSON.stringify({ token: "t" }));
      if (req.url === "/api/groq") return void res.end(JSON.stringify({ name: "Lernen und Sport", duration: 75, productivity: 4, difficulty: 3, category: "learning", bonus: false }));
      if (req.url === "/api/tasks") return void res.writeHead(201).end(JSON.stringify({ id: "x1", name: body.name }));
      res.end(JSON.stringify({ xpEarned: 17 }));
    });
  });
  return new Promise<{ url: string; seen: typeof seen; close: () => void }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as any).port}`, seen, close: () => server.close() })),
  );
}

test("desktop: todo with deadlines, have done, calendar, tracker", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 860 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const tracker = await fakeTracker();

  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");

  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  await page.locator("[data-newtitle]").fill("Zahnarzt morgen 15 Uhr !1");
  await shot(page, "01-new-todo");
  await page.locator("[data-newtitle]").press("Enter");
  await page.waitForTimeout(300);
  await addVia(page, "todo", "Milch kaufen");
  const row = page.getByRole("button", { name: /Zahnarzt/ });
  await expect(row).toContainText("Morgen 15:00");
  // one list without sections: the dated one (due within 24 h) is on top
  await expect(page.getByRole("heading", { name: /Ohne Deadline/ })).toHaveCount(0);
  expect(await page.getByRole("button", { name: /Zahnarzt|Milch/ }).allTextContents().then((a) => a.findIndex((x) => x.includes("Zahnarzt")))).toBe(0);
  await shot(page, "02-todo");

  // detail: checklist note + custom dropdown for repeat
  await row.click();
  await page.getByRole("textbox", { name: "Notiz" }).fill("- Versicherungskarte");
  await page.getByRole("textbox", { name: "Notiz" }).blur();
  await expect(row).toContainText("0/1");
  await page.getByRole("button", { name: "Wiederholen" }).click();
  await expect(page.getByRole("listbox", { name: "Wiederholen" })).toBeVisible();
  await shot(page, "03-detail-dropdown");
  await page.getByRole("option", { name: "Wöchentlich" }).click();
  await expect(page.getByRole("button", { name: "Wiederholen" })).toContainText("Wöchentlich");
  await page.getByRole("button", { name: "Schließen" }).click();

  // completing moves the task to Have Done
  await page.getByRole("checkbox", { name: "Milch kaufen" }).click();
  await expect(page.getByRole("button", { name: /Milch kaufen/ })).toHaveCount(0);
  await page.goto("/#/done");
  await expect(page.getByRole("button", { name: /Milch kaufen/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Heute/ })).toBeVisible();
  await addVia(page, "done", "Sport gemacht // 5 km");
  await expect(page.getByRole("button", { name: /Sport gemacht/ })).toContainText("5 km");
  await shot(page, "04-have-done");

  // reopening sends it back to Todo
  await page.getByRole("checkbox", { name: "Sport gemacht" }).click();
  await expect(page.getByRole("button", { name: /Sport gemacht/ })).toHaveCount(0);
  await page.goto("/#/todo");
  await expect(page.getByRole("button", { name: /Sport gemacht/ })).toBeVisible();

  // calendar: the open deadline shows tomorrow, the completed one today with a check
  await page.goto("/#/calendar");
  await expect(page.getByRole("button", { name: /Zahnarzt/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Milch kaufen/ })).toBeVisible();
  await shot(page, "05-calendar-month");

  // tracker: connect in settings, then the paper plane appears in Have Done
  await page.goto("/#/done");
  await expect(page.getByRole("button", { name: "An Productivity-Tracker senden", exact: true })).toHaveCount(0);
  await page.goto("/#/settings");
  await page.getByPlaceholder("https://").fill(tracker.url);
  await page.getByLabel("Benutzername").fill("mat");
  await page.getByLabel("Passwort", { exact: true }).fill("secret123");
  await page.getByRole("button", { name: "Verbinden" }).click();
  await expect(page.getByText("Verbunden", { exact: true })).toBeVisible();
  await shot(page, "10-settings");
  await page.goto("/#/done");
  await page.getByRole("button", { name: "An Productivity-Tracker senden", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "+17 XP" })).toBeVisible();
  expect(tracker.seen.map((s) => s.path)).toEqual(["/api/auth/login", "/api/auth/login", "/api/groq", "/api/tasks", "/api/tasks/x1/complete"]);
  expect(tracker.seen[2].body.description).toContain("Milch kaufen");
  await expect(page.getByRole("button", { name: "An Productivity-Tracker senden", exact: true })).toHaveCount(0);

  // habits + pomodoro still work
  await page.goto("/#/habits");
  await page.getByRole("button", { name: "Neue Gewohnheit" }).first().click();
  await page.getByRole("dialog").getByRole("textbox").first().fill("Wasser trinken");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("checkbox", { name: "Wasser trinken" }).click();
  await page.goto("/#/pomodoro");
  await expect(page.getByRole("timer")).toContainText("25:00");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(1300);
  await expect(page.getByRole("timer")).not.toContainText("25:00");
  await shot(page, "08-pomodoro");
  await page.getByRole("button", { name: "Pause" }).first().click();

  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Dunkel", exact: true }).click();
  await page.goto("/#/todo");
  await page.waitForTimeout(400);
  await shot(page, "11-dark-todo");
  expect(errors).toEqual([]);
  tracker.close();
});

test("mobile: swipes, sheet, notes, dropdown", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: "de-DE", timezoneId: "Europe/Berlin" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");

  await expect(page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Todo" })).toBeVisible();
  await addVia(page, "todo", "Heute Sport 18 Uhr // Trikot mitnehmen");
  const row = page.getByRole("button", { name: /Sport/ }).first();
  await expect(row).toContainText("Heute 18:00");
  await expect(row).toContainText("Trikot mitnehmen");
  await shot(page, "20-mobile-todo");

  // note tap opens the sheet with the note focused
  await page.getByRole("button", { name: "Notiz" }).first().click();
  await expect(page.getByRole("textbox", { name: "Notiz" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Notiz" })).toHaveValue(/^\u200b?Trikot mitnehmen\u200b?$/);

  // "- " turns a line into a round checkbox item inside the notes
  await page.keyboard.press("Enter");
  await page.keyboard.type("- Socken");
  await expect(page.getByRole("checkbox", { name: "Socken" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Socken" }).click();
  await expect(page.getByRole("checkbox", { name: "Socken" })).toHaveAttribute("aria-checked", "true");

  // custom dropdown instead of the native popup
  await page.getByRole("button", { name: "Wiederholen" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await shot(page, "21-mobile-dropdown");
  await page.getByRole("option", { name: "Täglich" }).click();
  await expect(page.getByRole("button", { name: "Wiederholen" })).toContainText("Täglich");

  // drag the sheet down to close it
  await page.waitForTimeout(500);
  await swipe(page, [195, 84], [195, 520]);
  await expect(page.getByRole("textbox", { name: "Notiz" })).toHaveCount(0, { timeout: 3000 });

  // swipe the row right: done -> shows up in Have Done (a repeating task leaves a finished copy)
  const box = (await page.getByRole("button", { name: /Sport/ }).first().boundingBox())!;
  await swipe(page, [60, box.y + 20], [300, box.y + 20]);
  await page.waitForTimeout(500);
  await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Have Done" }).click();
  await expect(page.getByRole("button", { name: /Sport/ }).first()).toBeVisible();
  await shot(page, "22-mobile-have-done");

  // edge swipe opens the menu, swipe back closes it
  const nav = page.getByRole("navigation", { name: "Navigation" });
  const right = async () => { const b = (await nav.boundingBox())!; return Math.round(b.x + b.width); };
  await swipe(page, [4, 400], [260, 405]);
  await expect.poll(right).toBeGreaterThan(280);
  await swipe(page, [250, 400], [20, 405]);
  await expect.poll(right).toBeLessThanOrEqual(2);

  // calendar: swiping moves time
  await page.goto("/#/calendar");
  const title = page.locator("[role=heading]").first();
  const before = await title.textContent();
  await swipe(page, [320, 400], [60, 400]);
  await expect(title).not.toHaveText(before!);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("overlay routes used by the widget render the same sheets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  await addVia(page, "todo", "Overlay Test");
  await page.getByRole("button", { name: /Overlay Test/ }).click();
  const id = await page.evaluate(async () => {
    const req = indexedDB.open("dayloop");
    return await new Promise<string>((res) => {
      req.onsuccess = () => {
        const db = req.result;
        const all = db.transaction("items").objectStore("items").getAll();
        all.onsuccess = () => res((all.result.find((r: any) => r.type === "task" && r.data.title === "Overlay Test") as any).id);
      };
    });
  });
  await page.goto(`/#/overlay/task/${id}`);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Titel" })).toHaveValue("Overlay Test");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await shot(page, "30-overlay-task");
  await page.goto("/#/overlay/new/done");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Erledigtes eintragen" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tabs" })).toHaveCount(0);
});

test("calendar: ticked checklist items appear color coded, pinch changes the time frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  await addVia(page, "todo", "Kalenderprobe heute");
  await page.getByRole("button", { name: /Kalenderprobe/ }).first().click();
  await page.getByRole("textbox", { name: "Notiz" }).click();
  await page.keyboard.type("- Teil A");
  await page.getByRole("checkbox", { name: "Teil A" }).click();
  await expect(page.getByRole("checkbox", { name: "Teil A" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("textbox", { name: "Notiz" }).blur();
  await page.goto("/#/calendar");
  await page.reload();
  await expect(page.getByRole("button", { name: /Teil A/ })).toBeVisible();
  expect(await page.locator("[data-date]").count()).toBeLessThan(4);
  // pinch together = wider view
  const cdp = await page.context().newCDPSession(page);
  const two = (a: number) => [{ x: 195 - a, y: 400, id: 1 }, { x: 195 + a, y: 400, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: two(100) });
  for (const a of [80, 60, 40, 30]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: two(a) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.locator("[data-date]").count()).toBeGreaterThan(6);
  await shot(page, "40-calendar-week");
});

test("regressions: note autosave, priority label, completions in calendar, habits, zoom taps, custom focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  await addVia(page, "todo", "Autosave Test");

  // typing a note and swiping the sheet away without blur must still save
  await page.getByRole("button", { name: /Autosave Test/ }).first().click();
  await page.getByRole("textbox", { name: "Notiz" }).click();
  await page.keyboard.type("Hallo Welt");
  await page.waitForTimeout(500);
  await swipe(page, [195, 84], [195, 520]);
  await expect(page.getByRole("textbox", { name: "Notiz" })).toHaveCount(0, { timeout: 3000 });
  await page.getByRole("button", { name: /Autosave Test/ }).first().click();
  await expect(page.getByRole("textbox", { name: "Notiz" })).toHaveValue(/^\u200b?Hallo Welt\u200b?$/);

  // tapping the label next to the priority buttons must not change the priority
  await page.getByRole("button", { name: "Hoch" }).click();
  await page.getByText("Priorität", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Hoch" })).toHaveClass(/bg-raise/);

  // habit done today shows in the calendar
  await page.goto("/#/habits");
  await page.getByRole("button", { name: "Neue Gewohnheit" }).click();
  await page.getByRole("textbox").first().fill("Wasser trinken");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("checkbox", { name: "Wasser trinken" }).click();

  // a todo without deadline, completed now, sits at the completion time in the day grid
  await page.goto("/#/todo");
  await page.getByRole("checkbox", { name: "Autosave Test" }).click();
  await page.waitForTimeout(500);
  await page.goto("/#/calendar");
  await expect(page.locator(".overflow-y-auto").getByRole("button", { name: /Autosave Test/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Wasser trinken/ })).toBeVisible();

  // month -> tap a day = zoom into that week
  await page.getByRole("button", { name: "Monat" }).first().click();
  await expect.poll(() => page.locator("[data-date]").count()).toBeGreaterThan(30);
  await page.waitForTimeout(600); // the zoom animation between the levels has to finish first
  // a day without chips (today carries some, and the clicked point may be on one of them)
  await page.locator("[data-date]:not(:has(button[title]))").nth(10).click();
  await expect.poll(() => page.locator("[data-date]").count(), { timeout: 4000 }).toBeLessThan(20);
  await shot(page, "41-zoom-week");

  // custom focus length
  await page.goto("/#/pomodoro");
  await page.getByRole("button", { name: "Eigene" }).click();
  const minutes = page.getByRole("textbox", { name: "Eigene Zeit (Minuten)" });
  await minutes.fill("");
  await expect(page.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
  await minutes.fill("7");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByRole("timer")).toContainText("07:00");
});

test("dropdown scrolls by touch", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  for (let i = 1; i <= 12; i++) await addVia(page, "todo", `Aufgabe ${i}`);
  await page.goto("/#/pomodoro");
  await page.getByRole("button", { name: "Keine Aufgabe verknüpft" }).click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  await swipe(page, [box.x + 100, box.y + box.height - 20], [box.x + 100, box.y + 20]);
  await expect(list).toBeVisible();
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

});

test("long pinch skips a level", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  // month view, spread a lot: month -> week -> day in one gesture, around the current month
  await page.goto("/#/calendar");
  await page.getByRole("button", { name: "Monat" }).first().click();
  await expect.poll(() => page.locator("[data-date]").count()).toBeGreaterThan(30);
  await page.waitForTimeout(600); // let the switch animation finish
  const cdp = await page.context().newCDPSession(page);
  const two = (a: number) => [{ x: 195 - a, y: 400, id: 1 }, { x: 195 + a, y: 400, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: two(40) });
  for (const a of [50, 60, 90, 120, 150, 180, 200]) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: two(a) }); await page.waitForTimeout(50); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.locator("[data-date]").count(), { timeout: 4000 }).toBeLessThan(4);
});

test("pinch goes in and out in one gesture, week tasks are not tappable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  await addVia(page, "todo", "Heute Aufgabe heute 10 Uhr");
  await page.goto("/#/calendar");
  await page.getByRole("button", { name: "Monat" }).first().click();
  await expect.poll(() => page.locator("[data-date]").count()).toBeGreaterThan(30);
  await page.waitForTimeout(600);
  const cdp = await page.context().newCDPSession(page);
  const two = (a: number) => [{ x: 195 - a, y: 400, id: 1 }, { x: 195 + a, y: 400, id: 2 }];
  const move = async (list: number[]) => { for (const a of list) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: two(a) }); await page.waitForTimeout(40); } };
  // spread (month -> week), then close again without lifting (week -> month)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: two(40) });
  await move([50, 65, 80, 100, 120]);
  await move([100, 80, 60, 45, 30, 20]);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.locator("[data-date]").count(), { timeout: 4000 }).toBeGreaterThan(30);
  // spread again: lands on the current week, today's day column is in it
  await page.waitForTimeout(600);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: two(40) });
  await move([50, 80]);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.locator("[data-date]").count(), { timeout: 4000 }).toBeLessThan(20);
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await expect(page.locator(`[data-date="${iso}"]`).first()).toBeVisible();
  // week view: a task chip does not open the task; the weekday header zooms into the day
  const chip = page.getByTitle("Aufgabe").first();
  await expect(chip).toBeVisible();
  expect(await chip.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await page.locator(`[data-date="${iso}"] button`).first().click();
  await expect.poll(() => page.locator("[data-date]").count(), { timeout: 4000 }).toBeLessThan(4);
});

test("a single finger (or a finger plus an edge touch) never zooms the calendar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/calendar");
  await page.getByRole("button", { name: "Monat" }).first().click();
  await expect.poll(() => page.locator("[data-date]").count()).toBeGreaterThan(30);
  await page.waitForTimeout(600);
  const cdp = await page.context().newCDPSession(page);
  const pts = (...p: [number, number][]) => p.map(([x, y], i) => ({ x, y, id: i + 1 }));
  // one finger dragging around
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts([200, 400]) });
  for (const y of [380, 350, 320, 300]) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts([200, y]) }); await page.waitForTimeout(30); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  // a stuck touch at the screen edge plus one moving finger
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts([4, 500], [250, 400]) });
  for (const x of [270, 300, 330]) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts([4, 500], [x, 400]) }); await page.waitForTimeout(30); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(500);
  expect(await page.locator("[data-date]").count()).toBeGreaterThan(30);
});

test("assistant runs tools on the app (Groq mocked)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.evaluate(() => localStorage.setItem("dl_groq", "test-key"));
  // seed a habit and a task
  await page.goto("/#/habits");
  await page.getByRole("button", { name: "Neue Gewohnheit" }).click();
  await page.getByRole("textbox").first().fill("Wasser trinken");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.goto("/#/todo");
  await addVia(page, "todo", "Zahnarzt");
  const call = (name: string, args: object, id: string) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
  await page.route("https://api.groq.com/**", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    const answered = body.messages.some((m: any) => m.role === "tool");
    const message = answered
      ? { content: "Alles erledigt." }
      : { tool_calls: [
          call("add_task", { title: "Bericht", dueDate: "2030-01-05", dueTime: "09:30", priority: 3, reminders: [60] }, "1"),
          call("complete_task", { query: "zahnarzt" }, "2"),
          call("log_habit", { name: "wasser" }, "3"),
          call("add_motivation_text", { title: "Durchhalten", body: "Ein Schritt nach dem anderen." }, "4"),
          call("create_habit", { name: "Lesen", target: 2, days: [1, 2, 3] }, "5"),
          call("add_checklist_item", { query: "bericht", text: "Gliederung" }, "6"),
          call("start_timer", { minutes: 7 }, "7"),
        ] };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ choices: [{ message }] }) });
  });
  await page.goto("/#/assistant");
  await page.getByRole("textbox", { name: "Oder schreib es hier …" }).fill("mach alles");
  await page.getByRole("textbox", { name: "Oder schreib es hier …" }).press("Enter");
  await expect(page.getByText("Alles erledigt.")).toBeVisible();
  await page.goto("/#/todo");
  await expect(page.getByRole("button", { name: /Bericht/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Zahnarzt/ })).toHaveCount(0);
  await page.goto("/#/habits");
  await expect(page.getByText("Lesen")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Wasser trinken" })).toHaveAttribute("aria-checked", "true");
  await page.goto("/#/motivation");
  await expect(page.getByText("Durchhalten")).toBeVisible();
  await page.goto("/#/pomodoro");
  await expect(page.getByRole("timer")).toContainText("07:");
});

test("motivation texts open in a clean read view, the pencil edits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/motivation");
  await page.getByRole("button", { name: "Neuer Text" }).click();
  await page.getByRole("textbox", { name: "Titel" }).fill("Durchhalten");
  await page.getByRole("textbox", { name: "Notiz" }).fill("Ein Schritt nach dem anderen.");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("button", { name: /Durchhalten/ }).click();
  await expect(page.getByText("Ein Schritt nach dem anderen.").last()).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await page.getByRole("textbox", { name: "Notiz" }).fill("Neu.");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Neu.").last()).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("notes: arrow keys and selection moves travel between lines", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  await addVia(page, "todo", "Navigationsprobe");
  await page.getByRole("button", { name: /Navigationsprobe/ }).first().click();
  await page.getByRole("textbox", { name: "Notiz" }).first().click();
  await page.keyboard.type("Erste");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- Zweite");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Dritte");
  const lines = page.getByRole("textbox", { name: "Notiz" });
  await expect(lines).toHaveCount(3);
  // up/down between lines, caret column kept
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type("X");
  await expect(lines.nth(0)).toHaveValue(/^​?Erste?X?/);
  await expect(lines.nth(0)).toHaveValue(/X/);
  // caret reaching the end of a line continues in the next one (what the space-bar slide on a phone does)
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("Y");
  await expect(lines.nth(1)).toHaveValue(/Y/);
  // a selection change to the very start of a line (what a phone keyboard's space-bar slide produces) continues in the previous line
  await page.waitForTimeout(600); // a selection right after a click counts as the click landing there
  await page.evaluate(() => { const t = document.querySelectorAll("textarea")[2] as HTMLTextAreaElement; t.focus(); t.setSelectionRange(0, 0); });
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("textarea")].indexOf(document.activeElement as HTMLTextAreaElement))).toBe(1);
  // Backspace at the start of a checklist line turns it back into text, then joins with the previous one
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("checkbox", { name: /Zweite/ })).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await expect(lines).toHaveCount(2);
});

test("calendar: plus creates an appointment that enters the todo list only shortly before", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/calendar");
  const iso = (n: number) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const make = async (title: string, date: string, time: string) => {
    await page.getByRole("button", { name: "Neuer Termin" }).click();
    await page.locator("[data-newtitle]").fill(title);
    await page.locator('input[type="date"]').fill(date);
    if (time) await page.locator('input[type="time"]').fill(time);
    await page.getByRole("button", { name: "Hinzufügen" }).click();
    await page.waitForTimeout(400);
  };
  await make("Fernes Konzert", iso(10), "20:00");
  await make("Naher Zahnarzt", iso(0), "23:30");
  await page.goto("/#/todo");
  await expect(page.getByRole("button", { name: /Naher Zahnarzt/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fernes Konzert/ })).toHaveCount(0);
  await page.goto("/#/calendar");
  await expect(page.getByRole("button", { name: /Naher Zahnarzt/ }).first()).toBeVisible();
  await shot(page, "50-appointment");
});

test("search bar: typed text creates entries, fuzzy finds tasks, Enter runs", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  await page.keyboard.press("Control+k");
  const box = page.getByRole("dialog", { name: /Suchen/ }).getByRole("textbox");
  await box.fill("Gassi gehen morgen");
  await box.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Hinzugefügt" })).toBeVisible();
  await box.fill("Referat: recherchieren, Folien, üben");
  await box.press("Enter");
  await box.fill("Kassi");
  await expect(page.getByRole("button", { name: /Gassi gehen/ }).first()).toBeVisible();
  await box.press("Escape");
  await expect(page.getByRole("button", { name: /Referat/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Referat/ }).first().click();
  await expect(page.getByRole("checkbox", { name: "Folien" })).toBeVisible();
  await shot(page, "51-search");
});

test("motivation audio: list renders, the global player bar stays across pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/motivation");
  await page.getByRole("button", { name: "Audio" }).click();
  // 1 s of silence as WAV
  const wav = Buffer.alloc(44 + 8000);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + 8000, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(8000, 40);
  await page.locator('input[type="file"]').setInputFiles({ name: "stille.wav", mimeType: "audio/wav", buffer: wav });
  await page.getByRole("button", { name: "stille" }).click();
  await expect(page.getByRole("region", { name: "stille" })).toBeVisible();
  await page.goto("/#/todo");
  await expect(page.getByRole("region", { name: "stille" })).toBeVisible();
});

test("mobile drawers: right edge opens the assistant chat (history kept), pulling the menu further opens the search", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: "de-DE" });
  await ctx.addInitScript(() => localStorage.setItem("dl_groq", "gsk_test"));
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  await page.waitForTimeout(600);
  await swipe(page, [386, 400], [100, 405]);
  const box = page.getByRole("textbox", { name: "Oder schreib es hier …" });
  await expect(box).toBeVisible();
  // the request to Groq fails in the test: question and error stay in the history
  await box.fill("Hallo Assistent");
  await box.press("Enter");
  await expect(page.getByText("Hallo Assistent")).toBeVisible();
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForTimeout(600);
  await swipe(page, [386, 400], [100, 405]);
  await expect(page.getByText("Hallo Assistent")).toBeVisible();
  await swipe(page, [100, 400], [380, 405]);
  await page.waitForTimeout(500);
  // menu from the left edge, then a bit further: search opens, the menu goes back
  await swipe(page, [4, 400], [370, 405]);
  await expect(page.getByRole("dialog", { name: /Suchen/ })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navigation" });
  await expect.poll(async () => { const b = (await nav.boundingBox())!; return Math.round(b.x + b.width); }).toBeLessThanOrEqual(2);
});

test("search bar details: notes and checklist go into the new task; bold and italic render", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  await page.keyboard.press("Control+k");
  const box = page.getByRole("dialog", { name: /Suchen/ }).getByRole("textbox");
  await box.fill("Steuer morgen");
  await box.press("Tab");
  const detail = page.getByRole("dialog", { name: "Details" });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("textbox", { name: "Titel" })).toHaveValue("Steuer morgen");
  await detail.getByRole("textbox", { name: "Notiz" }).first().click();
  await page.keyboard.type("Belege sammeln");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- Formular ausfüllen");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("status").filter({ hasText: "Hinzugefügt" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Steuer/ }).first().click();
  await expect(page.getByRole("checkbox", { name: "Formular ausfüllen" })).toBeVisible();
  // bold: select the first note line, Ctrl+B
  const first = page.getByRole("textbox", { name: "Notiz" }).first();
  await first.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("Control+b");
  await expect(first).toHaveValue(/\*\*Belege sammeln\*\*/);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-notes] .font-bold")).toHaveText("Belege sammeln");
});

test("calendar: a ticked checklist item opens its task with the item pointed out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");
  await addVia(page, "todo", "Punktprobe heute");
  await page.getByRole("button", { name: /Punktprobe/ }).first().click();
  await page.getByRole("textbox", { name: "Notiz" }).click();
  await page.keyboard.type("- Teil X");
  await page.getByRole("checkbox", { name: "Teil X" }).click();
  await page.getByRole("textbox", { name: "Notiz" }).blur();
  await page.goto("/#/calendar");
  await page.reload();
  await page.getByRole("button", { name: /Teil X/ }).first().click();
  await expect(page.locator("[data-hl]")).toHaveCount(1);
});

test("focus page fits every orientation without horizontal overflow", async ({ browser }) => {
  for (const [w, h, touch] of [[1400, 850, false], [800, 1200, false], [390, 844, true], [844, 390, true]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, locale: "de-DE" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
    await page.goto("/#/pomodoro");
    await page.waitForTimeout(500);
    const ring = (await page.getByRole("timer").boundingBox())!;
    const main = (await page.locator("main").boundingBox())!;
    expect(ring.x).toBeGreaterThanOrEqual(main.x - 1);
    expect(ring.x + ring.width).toBeLessThanOrEqual(main.x + main.width + 1);
    expect(ring.y + ring.height).toBeLessThanOrEqual(h + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    await ctx.close();
  }
});
