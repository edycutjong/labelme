import { describe, it, expect } from "vitest";
import { counterpartyClass, classFromTag, classFromEntity, tagIsNeutral, resolveClass, isPoolTag, PRECEDENCE, CLASS_INFO, POOL_TAG } from "../src/classes.js";

describe("counterpartyClass — the other side of a transfer, bucketed", () => {
  it("live strings observed 2026-09-18 land in the expected buckets", () => {
    expect(counterpartyClass(["Liquidity Pool"])).toBe("pool");
    expect(counterpartyClass(["Uniswap V2"])).toBe("pool");
    expect(counterpartyClass(["UniswapV2"])).toBe("pool");
    expect(counterpartyClass(["Token Billionaire"])).toBe("wealth");
    expect(counterpartyClass(["High Balance"])).toBe("wealth");
    expect(counterpartyClass(["High Activity"])).toBe("activity");
    expect(counterpartyClass(["MultiSig"])).toBe("contract");
    expect(counterpartyClass(["Proxy"])).toBe("contract");
    expect(counterpartyClass(["Ziggy Token Deployer"])).toBe("contract");
    expect(counterpartyClass(["nedskreo.eth"])).toBe("ens");
    expect(counterpartyClass(['"McFly10125" on OpenSea'])).toBe("ens");
    expect(counterpartyClass(["🏦 Binance: Deposit"])).toBe("entity");
    expect(counterpartyClass(["Usual USD"])).toBe("other");
  });
  it("null, empty and whitespace-only labels are unlabelled", () => {
    expect(counterpartyClass(null)).toBe("unlabelled");
    expect(counterpartyClass(undefined)).toBe("unlabelled");
    expect(counterpartyClass([])).toBe("unlabelled");
    expect(counterpartyClass(["  "])).toBe("unlabelled");
  });
  it("a pool wins over a wealth tag on the same counterparty", () => {
    expect(counterpartyClass(["Token Millionaire", "Liquidity Pool"])).toBe("pool");
  });
});

describe("classFromTag — free-tier holder tags", () => {
  it("wealth tags → whale, structural tags → contract, everything else undecidable", () => {
    expect(classFromTag("Token Billionaire")).toBe("whale");
    expect(classFromTag("PEPE Whale")).toBe("whale");
    expect(classFromTag("ETH Millionaire")).toBe("whale");
    expect(classFromTag("Liquidity Pool")).toBe("contract");
    expect(classFromTag("Gnosis Safe Proxy")).toBe("contract");
    expect(classFromTag("Token Contract")).toBe("contract");
    expect(classFromTag("High Activity")).toBeUndefined();
    expect(classFromTag("")).toBeUndefined();
    expect(classFromTag(null)).toBeUndefined();
  });
  it("an ENS name containing a structural word is a name, not a contract (allervault.eth)", () => {
    expect(classFromTag("allervault.eth")).toBeUndefined();
    expect(classFromTag("poolparty.eth*")).toBeUndefined();
  });
});

describe("classFromEntity — the 1-credit entity label outranks the tag", () => {
  it("🏦 marks an exchange; a pool stays a contract even with 🏦 (DEX); no entity keeps the fallback", () => {
    expect(classFromEntity("🤖 🏦 Luno: Wallet [0x3a5cc8]", "contract")).toBe("exchange");
    expect(classFromEntity("🏦 Binance [0x5a52e9]", "whale")).toBe("exchange");
    expect(classFromEntity("🤖 🏦 Uniswap: V2 PEPE-WETH Liquidity Pool  [0xa43fe1]", "exchange")).toBe("contract");
    expect(classFromEntity("🤖 Multisig [0x5b97a1]", "contract")).toBe("contract");
    expect(classFromEntity(null, "whale")).toBe("whale");
  });
  it("REGRESSION (audit 2026-09-19): an entity that names the contract itself stays a contract even with 🏦; an exchange's wallet does not", () => {
    expect(classFromEntity("🤖 🏦 Gnosis Safe Proxy [0xee136c]", "contract")).toBe("contract"); // deck card, recording's round card 10
    expect(classFromEntity("🤖 🏦 Gnosis Safe Proxy [0xee136c]", "exchange")).toBe("contract");
    expect(classFromEntity("🤖 🏦 CoinEx: Cold Wallet [0x548054]", "contract")).toBe("exchange");
    expect(classFromEntity("🏦 Kraken: Staking [0x000000]", "whale")).toBe("exchange");
    expect(classFromEntity("safe.eth", "regular")).toBe("regular");
    expect(classFromEntity("", "regular")).toBe("regular");
  });
  it("POOL_TAG is strict enough that a MultiSig or Proxy is not a pool; isPoolTag rejects ENS names like uniswap.eth", () => {
    expect(POOL_TAG.test("MultiSig")).toBe(false);
    expect(POOL_TAG.test("Proxy")).toBe(false);
    expect(POOL_TAG.test("Liquidity Pool")).toBe(true);
    expect(isPoolTag("uniswap.eth")).toBe(false);
    expect(isPoolTag("UniswapV2")).toBe(true);
    expect(isPoolTag("")).toBe(false);
    expect(classFromEntity("uniswap.eth", "regular")).toBe("regular");
  });
});

describe("tagIsNeutral / resolveClass / PRECEDENCE", () => {
  it("only empty, ENS and activity tags may sit on a regular card", () => {
    expect(tagIsNeutral("")).toBe(true);
    expect(tagIsNeutral(null)).toBe(true);
    expect(tagIsNeutral("huck.eth")).toBe(true);
    expect(tagIsNeutral("High Activity")).toBe(true);
    expect(tagIsNeutral("Token Millionaire")).toBe(false);
    expect(tagIsNeutral("Liquidity Pool")).toBe(false);
  });
  it("resolveClass picks the highest precedence; exchange beats smart-money beats whale", () => {
    expect(resolveClass(new Set(["whale", "smart-money"]))).toBe("smart-money");
    expect(resolveClass(new Set(["regular", "exchange"]))).toBe("exchange");
    expect(resolveClass(new Set())).toBeUndefined();
    expect(PRECEDENCE[0]).toBe("exchange");
  });
  it("every class has display info with a hex hue and a Nansen source sentence", () => {
    for (const k of Object.keys(CLASS_INFO)) {
      const i = CLASS_INFO[k as keyof typeof CLASS_INFO];
      expect(i.hue).toMatch(/^#[0-9a-f]{6}$/);
      expect(i.howNansenSaysIt).toMatch(/tgm|smart-money/);
    }
  });
});
