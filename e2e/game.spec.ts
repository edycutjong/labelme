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

test.describe("/r/meridian1933 — the recording's round", () => {
  test("deals card 1 face up with no label; a guess reveals Nansen's answer and the tell; ten cards reach the score", async ({ page }) => {
    await page.goto("/r/meridian1933");
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
    await expect(page).toHaveURL(/\/r\/meridian1933\?score=\d+$/);
  });
  test("keys 1–5 guess and Enter advances", async ({ page }) => {
    await page.goto("/r/meridian1933");
    await expect(page.locator(".round .wallet")).toBeVisible();
    await page.keyboard.press("3");
    await expect(page.locator(".reveal")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".round .wallet")).toContainText("Wallet 2 of 10");
  });
  test("the same seed deals the same ten ids (server API)", async ({ request }) => {
    const a = await (await request.get("/api/round?seed=meridian1933")).json();
    const b = await (await request.get("/api/round?seed=meridian1933")).json();
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
    await expect(pre.first()).toContainText("npm run labelme -- play --seed meridian1933 --answers");
    await expect(pre.first()).toContainText("npm run labelme -- draw --explain");
    await expect(pre.first()).not.toContainText("OFFLINE");
    await expect(pre.nth(1)).toContainText("npm run verify");
  });
});

test.describe("responsive + share", () => {
  test("no horizontal scroll on the round page", async ({ page }) => {
    await page.goto("/r/meridian1933");
    await expect(page.locator(".round .wallet")).toBeVisible();
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw);
  });
  test("REGRESSION (audit 2026-09-19): no horizontal scroll on / and /judge at 320 px (the example's fixture path overflowed)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    for (const path of ["/", "/judge"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(sw, path).toBeLessThanOrEqual(iw);
    }
  });
  test("the OG image renders for a score and the permalink carries OG tags", async ({ request }) => {
    const og = await request.get("/api/og?seed=meridian1933&score=7");
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toContain("image/png");
    const html = await (await request.get("/r/meridian1933?score=7")).text();
    expect(html).toContain("I read wallets 7/10");
    expect(html).toContain("/api/og?seed=meridian1933&amp;score=7");
  });
});

test.describe("audit 2026-09-19 regressions", () => {
  test("keys 1–5 still guess after a button took the focus (clicking the recorded-round chip)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /the recorded round/ }).click();
    await expect(page.locator(".round .wallet")).toBeVisible();
    await page.keyboard.press("2");
    await expect(page.locator(".reveal")).toBeVisible();
    await expect(page.locator(".dots-text")).toContainText("/1 right");
  });
  test("a contract card that sits in Nansen's Exchange group says so on the reveal (meridian1933 card 10)", async ({ page, request }) => {
    const r = (await (await request.get("/api/round?seed=meridian1933")).json()) as { cards: { id: string }[] };
    const a = (await (await request.get(`/api/reveal?id=${r.cards[9].id}&guess=exchange`)).json()) as { class: string; source: { labelType: string } };
    expect(a.class).toBe("contract");
    expect(a.source.labelType).toBe("exchange");
    await page.goto("/r/meridian1933");
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("1");
      await expect(page.locator(".reveal")).toBeVisible();
      await page.keyboard.press("Enter");
    }
    await page.keyboard.press("2");
    await expect(page.locator(".reveal")).toContainText("in Nansen's Exchange group");
  });
});

test.describe("review pass 1 regressions", () => {
  test("Draw fresh in the middle of a round, then Back, returns to the same card with the score intact", async ({ page }) => {
    await page.goto("/r/meridian1933");
    await expect(page.locator(".round .wallet")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.locator(".reveal")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".round .wallet")).toContainText("Wallet 2 of 10");
    await page.getByRole("button", { name: /Draw fresh/ }).click();
    await expect(page.locator(".round .wallet")).toContainText("Replayed card");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".round .wallet")).toContainText("Wallet 2 of 10");
    await expect(page.locator(".dots-text")).toContainText("1/1 right");
  });
  test("a percent-encoded seed in the permalink never 500s", async ({ request }) => {
    for (const p of ["/r/%25", "/r/%E0%A4%A", "/r/a%2Fb", "/r/..%2F..", "/r/%00"]) {
      const res = await request.get(p);
      expect(res.status(), p).toBeLessThan(500);
    }
  });
  test("Enter on the focused Next button advances exactly one card", async ({ page }) => {
    await page.goto("/r/meridian1933");
    await expect(page.locator(".round .wallet")).toBeVisible();
    await page.keyboard.press("2");
    await expect(page.locator(".reveal")).toBeVisible();
    await page.locator(".actions .btn.primary").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".round .wallet")).toContainText("Wallet 2 of 10");
    await expect(page.locator(".reveal")).toHaveCount(0);
  });
});

test.describe("the Nansen call rail (LANDING_DESIGN §13 A3)", () => {
  test("on load the rail holds the example's four recorded calls, replayed at 0 credits; the receipt totals match", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("complementary", { name: "Nansen API calls" });
    await expect(rail).toBeAttached();
    const rows = rail.locator(".rail-row");
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toHaveAttribute("data-state", "replayed");
    await expect(rows.first()).toContainText("POST");
    await expect(rows.first()).toContainText("0 cr · replayed");
    await expect(rail.locator(".rail-counters")).toHaveText("4 calls · 0 cr · replayed");
    await expect(rail.locator(".rail-foot")).toContainText("session · 4 calls · 0 credits");
    // never the key, never a full request body
    expect(await rail.innerHTML()).not.toMatch(KEY_SHAPE);
    expect(await rail.innerText()).not.toContain('"address"');
    await rail.getByRole("button", { name: "receipt" }).click();
    await expect(page.locator("[data-testid=drawer-sum]")).toContainText("0 credits · 4 calls · replayed from fixtures");
    await expect(page.locator(".drawer tbody tr")).toHaveCount(4);
  });
  test("a reveal lands the card's four recorded calls in the rail; clear empties it into the empty state", async ({ page }) => {
    await page.goto("/r/meridian1933");
    const rail = page.getByRole("complementary", { name: "Nansen API calls" });
    await expect(rail.locator(".rail-row")).toHaveCount(0);
    await expect(rail.locator(".rail-empty")).toContainText("No calls yet");
    await page.keyboard.press("3");
    await expect(page.locator(".reveal")).toBeVisible();
    await expect(rail.locator(".rail-row")).toHaveCount(4);
    await expect(rail.locator(".rail-counters")).toHaveText("4 calls · 0 cr · replayed");
    await page.keyboard.press("Enter");
    await page.keyboard.press("1");
    await expect(rail.locator(".rail-row")).toHaveCount(8);
    await expect(rail.locator(".rail-foot")).toContainText("session · 8 calls · 0 credits");
    await rail.getByRole("button", { name: "clear" }).click();
    await expect(rail.locator(".rail-row")).toHaveCount(0);
    await expect(rail.locator(".rail-empty")).toBeVisible();
  });
  test("the keyless Draw fresh replay still streams four real rows into the rail, labelled replayed", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Run it live now/ }).click();
    await expect(page.locator(".banner.warn")).toContainText("replay");
    const rail = page.getByRole("complementary", { name: "Nansen API calls" });
    await expect(rail.locator(".rail-row")).toHaveCount(8);
    await expect(rail.locator(".rail-row[data-state=replayed]")).toHaveCount(8);
    await expect(rail.locator(".rail-counters")).toHaveText("4 calls · 0 cr · replayed");
    await expect(page.locator(".round .wallet")).toBeVisible();
  });
  test("layout: ≥ 1280 px a fixed right rail with the page shifted left; below, a 44 px bar that opens with a tap and with Enter", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    const rail = page.locator(".rail");
    const box = (await rail.boundingBox())!;
    expect(box.width).toBe(360);
    expect(Math.round(box.x + box.width)).toBe(1920 - 24);
    expect(Math.round(box.y)).toBe(84);
    await expect(page.locator(".rail-bar")).toBeHidden();
    const main = (await page.locator("main.wrap").boundingBox())!;
    expect(main.x + main.width).toBeLessThanOrEqual(box.x);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const bar = page.getByTestId("rail-bar");
    await expect(bar).toBeVisible();
    expect(Math.round((await bar.boundingBox())!.height)).toBe(44);
    await expect(bar).toHaveAttribute("aria-expanded", "false");
    expect(Math.round((await rail.boundingBox())!.height)).toBe(44);
    await bar.click();
    await expect(bar).toHaveAttribute("aria-expanded", "true");
    await expect.poll(async () => (await rail.boundingBox())!.height).toBeGreaterThan(200);
    await bar.focus();
    await page.keyboard.press("Enter");
    await expect(bar).toHaveAttribute("aria-expanded", "false");
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw).toBeLessThanOrEqual(iw);
  });
});
