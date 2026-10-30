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
  await add.fill("Zahnarzt morgen 15 Uhr !1 #privat");
  await shot(page, "01-quickadd-preview");
  await add.press("Enter");
  await add.fill("Milch kaufen");
  await add.press("Enter");
  const row = page.getByRole("button", { name: /Zahnarzt/ });
  await expect(row).toContainText("Morgen 15:00");
  await expect(row).toContainText("privat");
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

test("mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ohne Konto fortfahren" }).click();
  await page.goto("/#/today");
  await page.locator("[data-quickadd]").fill("Heute Sport 18 Uhr");
  await page.locator("[data-quickadd]").press("Enter");
  await expect(page.getByRole("button", { name: /Sport/ })).toContainText("Heute 18:00");
  await shot(page, "20-mobile-today");
  await page.getByRole("button", { name: /Sport/ }).click();
  await shot(page, "21-mobile-detail");
});
