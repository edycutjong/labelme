import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { classByKey } from "../src/render.js";

const run = (args: string[], env: Record<string, string | undefined> = {}) =>
  spawnSync("npx", ["tsx", "packages/cli/src/cli.ts", ...args], { encoding: "utf8", env: { ...process.env, NANSEN_API_KEY: undefined, ...env } });

describe("classByKey — the interactive guess", () => {
  it("REGRESSION (audit 2026-09-19): a bare Enter is no guess, not Smart Money", () => {
    expect(classByKey("")).toBeUndefined();
    expect(classByKey("   ")).toBeUndefined();
    expect(classByKey("1")).toBe("smart-money");
    expect(classByKey("5")).toBe("regular");
    expect(classByKey("0")).toBeUndefined();
    expect(classByKey("6")).toBeUndefined();
    expect(classByKey("ex")).toBe("exchange");
    expect(classByKey("CEX")).toBe("exchange");
    expect(classByKey("wh")).toBe("whale");
    expect(classByKey("zzz")).toBeUndefined();
  });
});

describe("cli — the judge's first commands", () => {
  it("REGRESSION (audit 2026-09-19): `draw` without a key prints one sentence and exits 1 — never a stack trace", () => {
    const r = run(["draw"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("NANSEN_API_KEY is not set");
    expect(r.stderr).toContain("app.nansen.ai/api");
    expect(r.stderr + r.stdout).not.toMatch(/at .*client\.ts|Error:/);
  });
  it("`card <bad address>` says so before it asks for a key; `--seed` followed by a flag is an absent seed", () => {
    const r = run(["card", "vitalik.eth"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("card needs an ethereum address");
    const p = run(["play", "--seed", "--answers"]);
    expect(p.status).toBe(0);
    expect(p.stdout).not.toContain("round --answers");
    expect(p.stdout).toMatch(/round [A-Za-z0-9_-]{8} /);
  });
});
