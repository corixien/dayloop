import { expect, test } from "@playwright/test";

const shot = (page: any, name: string) => page.screenshot({ path: `e2e/shots/${name}.png` });

test("core flows on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 860 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();

  // quick add with natural language
  await page.goto("/#/inbox");
  const add = page.locator("[data-quickadd]");
  await add.fill("Zahnarzt morgen 15 Uhr !1");
  await shot(page, "01-quickadd-preview");
  await add.press("Enter");
  await add.fill("Milch kaufen");
  await add.press("Enter");
  const row = page.getByRole("button", { name: /Zahnarzt/ });
  await expect(row).toContainText("Morgen 15:00");
  await shot(page, "02-inbox");

  // detail panel: edit + subtask + priority
  await row.click();
  await page.getByPlaceholder("Teilaufgabe hinzufügen").fill("Versicherungskarte");
  await page.getByPlaceholder("Teilaufgabe hinzufügen").press("Enter");
  await expect(row).toContainText("0/1");
  await shot(page, "03-detail");

  // complete a task
  await page.getByRole("checkbox", { name: "Milch kaufen" }).click();
  await expect(page.getByRole("button", { name: /Milch kaufen/ })).toHaveCount(0);

  // list + kanban
  await page.getByRole("button", { name: "Neue Liste" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Uni");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/#\/list\//);
  await page.getByRole("button", { name: "Board" }).click();
  await shot(page, "04-kanban");

  // calendar
  await page.goto("/#/calendar");
  await expect(page.getByRole("button", { name: /Zahnarzt/ }).first()).toBeVisible();
  await shot(page, "05-calendar-month");
  await page.getByRole("button", { name: "Woche" }).click();
  await shot(page, "06-calendar-week");

  // habits
  await page.goto("/#/habits");
  await page.getByRole("button", { name: "Neue Gewohnheit" }).first().click();
  await page.getByRole("dialog").getByRole("textbox").first().fill("Wasser trinken");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.getByRole("checkbox", { name: "Wasser trinken" }).click();
  await shot(page, "07-habits");

  // pomodoro: default 25 min
  await page.goto("/#/pomodoro");
  await expect(page.getByRole("timer")).toContainText("25:00");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(1300);
  await expect(page.getByRole("timer")).not.toContainText("25:00");
  await shot(page, "08-pomodoro");
  await page.getByRole("button", { name: "Pause" }).first().click();

  await page.goto("/#/matrix");
  await shot(page, "09-matrix");
  await page.goto("/#/settings");
  await shot(page, "10-settings");

  // dark mode
  await page.getByRole("button", { name: "Dunkel", exact: true }).click();
  await page.goto("/#/today");
  await page.waitForTimeout(400);
  await shot(page, "11-dark-today");

  expect(errors).toEqual([]);
});

async function swipe(page: any, from: [number, number], to: [number, number], steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x: number, y: number) => [{ x, y }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(...from) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("mobile: chips, notes, swipes", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: "de-DE", timezoneId: "Europe/Berlin" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/todo");

  // chips instead of a dropdown, Todo is the first tab
  await expect(page.getByRole("link", { name: "Todo" })).toBeVisible();
  for (const n of ["Heute", "Alle", "Eingang"]) await expect(page.getByRole("tab", { name: n })).toBeVisible();
  await page.getByRole("tab", { name: "Eingang" }).click();
  await page.getByRole("button", { name: "Board" }).click();
  await expect(page.getByRole("heading", { name: "Ohne Datum" })).toBeVisible();
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await page.getByRole("tab", { name: "Heute" }).click();

  // quick add with a note after //
  await page.locator("[data-quickadd]").fill("Heute Sport 18 Uhr // Trikot mitnehmen");
  await page.locator("[data-quickadd]").press("Enter");
  const row = page.getByRole("button", { name: /Sport/ }).first();
  await expect(row).toContainText("Heute 18:00");
  await expect(row).toContainText("Trikot mitnehmen");
  await shot(page, "20-mobile-today");

  // tapping the note opens the sheet with the note focused
  await page.getByRole("button", { name: "Notiz" }).first().click();
  await expect(page.getByRole("textbox", { name: "Notiz" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Notiz" })).toHaveValue("Trikot mitnehmen");
  await shot(page, "21-mobile-detail");

  await page.waitForTimeout(500); // sheet slide-in animation
  // drag the sheet handle down to dismiss
  await swipe(page, [195, 84], [195, 520]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Notiz" })).toHaveCount(0, { timeout: 2000 });

  // swipe the row right: completes it
  const box = (await page.getByRole("button", { name: /Sport/ }).first().boundingBox())!;
  await swipe(page, [60, box.y + 20], [300, box.y + 20]);
  await expect(page.getByRole("button", { name: /Sport/ })).toHaveCount(0, { timeout: 3000 });

  // edge swipe opens the menu, swipe back closes it
  await swipe(page, [4, 400], [260, 405]);
  const nav = page.getByRole("navigation", { name: "Navigation" });
  const right = async () => { const b = (await nav.boundingBox())!; return Math.round(b.x + b.width); };
  await expect.poll(right).toBeGreaterThan(280);
  await shot(page, "22-mobile-drawer");
  await swipe(page, [250, 400], [20, 405]);
  await expect.poll(right).toBeLessThanOrEqual(2);

  // calendar: swiping moves time
  await page.goto("/#/calendar");
  const title = page.locator("h1,[role=heading]").first();
  const before = await title.textContent();
  await swipe(page, [320, 400], [60, 400]);
  await expect(title).not.toHaveText(before!);
  expect(errors).toEqual([]);
  await ctx.close();
});
