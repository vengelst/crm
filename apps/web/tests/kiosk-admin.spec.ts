import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

const API_ROOT = "http://localhost:3801/api";

async function loginAsAdmin(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kiosk-Anmeldung" })).toBeVisible();

  await page.getByRole("button", { name: "Admin-Login" }).click();
  await page.locator('input[type="email"]').fill("admin@example.local");
  await page.locator('input[type="password"]').fill("admin12345");
  await page.getByRole("button", { name: "Admin anmelden" }).click();

  await expect(page.getByRole("button", { name: "Abmelden" }).first()).toBeVisible();
}

async function loginAsWorkerViaApi(request: APIRequestContext) {
  const response = await request.post(`${API_ROOT}/auth/kiosk-login`, {
    data: { pin: "1234" },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{
    accessToken: string;
    worker: { id: string; workerNumber: string; name: string };
    currentProjects: { id: string; title: string; projectNumber: string }[];
  }>;
}

async function ensureNoOpenWork(request: APIRequestContext) {
  const session = await loginAsWorkerViaApi(request);
  const statusResponse = await request.get(`${API_ROOT}/time/status?workerId=${session.worker.id}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });
  expect(statusResponse.ok()).toBeTruthy();
  const status = await statusResponse.json() as {
    hasOpenWork: boolean;
    openEntry: null | { projectId: string };
  };

  if (status.hasOpenWork && status.openEntry) {
    const closeResponse = await request.post(`${API_ROOT}/time/clock-out`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      data: {
        workerId: session.worker.id,
        projectId: status.openEntry.projectId,
        latitude: 52.52,
        longitude: 13.405,
        locationSource: "live",
        sourceDevice: "playwright",
      },
    });
    expect(closeResponse.ok()).toBeTruthy();
  }

  return session;
}

async function loginAsWorkerUi(page: Page, context: BrowserContext) {
  await context.grantPermissions(["geolocation"], { origin: "http://localhost:3800" });
  await context.setGeolocation({ latitude: 52.52, longitude: 13.405 });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kiosk-Anmeldung" })).toBeVisible();
  for (const digit of ["1", "2", "3", "4"]) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Zeiterfassung" })).toBeVisible();
}

test("Kiosk Theme, Logout Reset und Monteur-Klick funktionieren", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kiosk-Anmeldung" })).toBeVisible();

  const html = page.locator("html");
  const initialClass = await html.getAttribute("class");

  await page.getByRole("button", { name: "Theme umschalten" }).click();
  await expect.poll(async () => await html.getAttribute("class")).not.toBe(initialClass);

  await page.getByRole("button", { name: "Theme umschalten" }).click();
  await expect.poll(async () => await html.getAttribute("class")).toBe(initialClass);

  for (const digit of ["1", "2", "3", "4"]) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await expect(page.locator('input[name="pin"]')).toHaveValue("1234");

  await page.getByRole("button", { name: "Admin-Login" }).click();
  await page.locator('input[type="email"]').fill("admin@example.local");
  await page.locator('input[type="password"]').fill("admin12345");
  await page.getByRole("button", { name: "Admin anmelden" }).click();

  await expect(page.getByRole("button", { name: "Abmelden" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Monteure", exact: true }).first().click();
  await expect(page.getByText("Monteursliste")).toBeVisible();

  const firstWorkerRow = page.getByText(/Max Monteur|Test Monteuradmin12345/).first();
  await firstWorkerRow.click();

  await expect(page.getByRole("heading", { name: "Monteur Detail" })).toBeVisible();
  await page.getByRole("button", { name: "Abmelden" }).first().click();

  await expect(page.getByRole("heading", { name: "Kiosk-Anmeldung" })).toBeVisible();
  await expect(page.locator('input[name="pin"]')).toHaveValue("");
});

test("Admin kann Monteure weiter normal oeffnen", async ({ page }) => {
  await loginAsAdmin(page);

  await page.getByRole("link", { name: "Monteure", exact: true }).first().click();
  await expect(page.getByText("Monteursliste")).toBeVisible();

  await page.getByText(/Max Monteur|Test Monteuradmin12345/).first().click();
  await expect(page.getByRole("heading", { name: "Monteur Detail" })).toBeVisible();
  await expect(page.getByText("Arbeitsprotokoll")).toBeVisible();
});

test("Monteur kann sich per PIN anmelden und Arbeit starten und beenden", async ({ page, request, context }) => {
  const session = await ensureNoOpenWork(request);
  expect(session.currentProjects.length).toBeGreaterThan(0);

  await loginAsWorkerUi(page, context);
  await expect(page.getByText(session.worker.workerNumber)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Arbeit beginnen" })).toBeVisible();

  await page.getByText(session.currentProjects[0].title).click();
  await page.getByRole("button", { name: "Arbeit beginnen" }).click();

  await expect(page.getByRole("button", { name: "Arbeit beenden" })).toBeVisible();
  await expect(page.getByText("Arbeit gestartet.")).toBeVisible();

  await page.getByRole("button", { name: "Arbeit beenden" }).click();
  await expect(page.getByRole("heading", { name: "Arbeit beginnen" })).toBeVisible();
  await expect(page.getByText("Arbeit beendet.")).toBeVisible();
});

test("Monteur kann aktuellen Stundenzettel erzeugen und unterschreiben", async ({ page, request, context }) => {
  await ensureNoOpenWork(request);
  await loginAsWorkerUi(page, context);

  await expect(page.getByRole("heading", { name: "Stundenzettel" })).toBeVisible();
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Stundenzettel" }) }).getByRole("button").filter({ hasText: /KW \d+/ }).first().click();

  await expect(page.getByText("Stundenzettel erzeugt.")).toBeVisible();
  await page.getByRole("button", { name: "Unterschreiben" }).first().click();
  await expect(page.getByRole("heading", { name: "Unterschrift" })).toBeVisible();

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Canvas nicht gefunden");

  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 60);
  await page.mouse.move(box.x + 220, box.y + 40);
  await page.mouse.up();

  await page.getByRole("button", { name: "Bestaetigen" }).click();
  await expect(page.getByText("Unterschrieben.")).toBeVisible();
});

test("Admin erreicht die Planung und kann ein Projekt zur Bearbeitung auswaehlen", async ({ page }) => {
  await loginAsAdmin(page);

  await page.getByRole("link", { name: "Planung", exact: true }).click();
  await expect(page.getByText("Projekt waehlen und einplanen")).toBeVisible();

  const planningSelect = page.locator("select").first();
  await planningSelect.selectOption({ index: 1 });
  await expect(page.getByText(/^Planung:/)).toBeVisible();
});
