import { test, expect } from "@playwright/test";

const KEY_SHAPE = /nsn_[A-Za-z0-9_]{8,}/;
const CLAIM = "Ten real wallets. Guess the Nansen label. The answer key is the label; the clues are Nansen's fields.";

test.describe("home", () => {
  test("renders the hero, the Deal panel and one revealed example card from the deck; no key-shaped bytes", async ({ page, request }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toMatch(KEY_SHAPE);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Can you read a");
    await expect(page.getByRole("button", { name: "Deal" })).toBeVisible();
    await expect(page.locator(".example .wallet")).toBeVisible();
    await expect(page.locator(".example .reveal")).toContainText("Smart Money");
    expect(await page.locator("h1").count()).toBe(1);
  });
  test("Deal starts a round from the deck at 0 credits and the URL becomes a permalink", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Deal" }).click();
    await expect(page.locator(".round .wallet")).toBeVisible();
    await expect(page).toHaveURL(/\/r\/[A-Za-z0-9_-]+$/);
    await expect(page.locator(".chips.choices .chip")).toHaveCount(5);
  });
});

test.describe("/r/meridian — the recording's round", () => {
  test("deals card 1 face up with no label; a guess reveals Nansen's answer and the tell; ten cards reach the score", async ({ page }) => {
    await page.goto("/r/meridian");
    const card = page.locator(".round .wallet");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Wallet 1 of 10");
    await expect(card.locator(".reveal")).toHaveCount(0);
    for (let i = 0; i < 10; i++) {
      await page.locator(".chips.choices .chip").first().click();
      await expect(page.locator(".reveal")).toBeVisible();
      await expect(page.locator(".reveal .tell")).not.toBeEmpty();
      await expect(page.locator(".reveal .provenance")).toContainText("Nansen said so via");
      await page.locator(".actions .btn.primary").click();
    }
    await expect(page.locator(".score")).toBeVisible();
    await expect(page.locator(".score-big")).toContainText(/You read wallets \d+\/10/);
    await expect(page).toHaveURL(/\/r\/meridian\?score=\d+$/);
  });
  test("keys 1–5 guess and Enter advances", async ({ page }) => {
    await page.goto("/r/meridian");
    await expect(page.locator(".round .wallet")).toBeVisible();
    await page.keyboard.press("3");
    await expect(page.locator(".reveal")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".round .wallet")).toContainText("Wallet 2 of 10");
  });
  test("the same seed deals the same ten ids (server API)", async ({ request }) => {
    const a = await (await request.get("/api/round?seed=meridian")).json();
    const b = await (await request.get("/api/round?seed=meridian")).json();
    expect(a.cards.map((c: { id: string }) => c.id)).toEqual(b.cards.map((c: { id: string }) => c.id));
    expect(a.cards).toHaveLength(10);
    expect(JSON.stringify(a)).not.toMatch(/"class":|"tell":/);
  });
});

test.describe("Draw fresh without a key — the honest replay path", () => {
  test("streams a replay notice and a deck card, never an error", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Draw fresh/ }).click();
    await expect(page.locator(".banner.warn")).toContainText("replay");
    await expect(page.locator(".round .wallet")).toBeVisible();
    await expect(page.locator(".banner.err")).toHaveCount(0);
    await page.locator(".chips.choices .chip").nth(1).click();
    await expect(page.locator(".reveal")).toBeVisible();
    await expect(page.locator(".house")).toContainText("0 credits (replay)");
  });
  test("/api/draw rejects an unknown class with 400", async ({ request }) => {
    const res = await request.post("/api/draw?class=hacker");
    expect(res.status()).toBe(400);
  });
});

test.describe("/judge", () => {
  test("200, no cookies, the claim, the real reproduce command and a separate replay line", async ({ page, request }) => {
    const res = await request.get("/judge", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["set-cookie"]).toBeUndefined();
    expect(await res.text()).not.toMatch(KEY_SHAPE);
    await page.goto("/judge");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(CLAIM);
    const pre = page.locator("pre");
    await expect(pre.first()).toContainText("npm run labelme -- play --seed meridian --answers");
    await expect(pre.first()).toContainText("npm run labelme -- draw --explain");
    await expect(pre.first()).not.toContainText("OFFLINE");
    await expect(pre.nth(1)).toContainText("npm run verify");
  });
});

test.describe("responsive + share", () => {
  test("no horizontal scroll on the round page", async ({ page }) => {
    await page.goto("/r/meridian");
    await expect(page.locator(".round .wallet")).toBeVisible();
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw);
  });
  test("the OG image renders for a score and the permalink carries OG tags", async ({ request }) => {
    const og = await request.get("/api/og?seed=meridian&score=7");
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toContain("image/png");
    const html = await (await request.get("/r/meridian?score=7")).text();
    expect(html).toContain("I read wallets 7/10");
    expect(html).toContain("/api/og?seed=meridian&amp;score=7");
  });
});
