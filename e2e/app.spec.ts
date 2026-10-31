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
  await expect(page.getByRole("heading", { name: /Ohne Deadline/ })).toBeVisible();
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
  await expect(page.getByRole("textbox", { name: "Notiz" })).toHaveValue("Trikot mitnehmen");

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
