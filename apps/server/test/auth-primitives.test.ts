import "./env";
import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { tokensEqual } from "../src/util/tokens";
import { consumePairingCode, getPairingCode, issuePairingCode } from "../src/pairing";

describe("tokensEqual", () => {
  test("matches identical tokens", () => {
    expect(tokensEqual("abc123", "abc123")).toBe(true);
  });

  test("rejects different tokens, including prefixes and empty strings", () => {
    expect(tokensEqual("abc123", "abc124")).toBe(false);
    expect(tokensEqual("abc123", "abc")).toBe(false);
    expect(tokensEqual("abc123", "abc1234")).toBe(false);
    expect(tokensEqual("abc123", "")).toBe(false);
  });
});

describe("pairing codes", () => {
  afterEach(() => setSystemTime());

  test("the same code is returned until it is used", () => {
    const first = getPairingCode();
    expect(getPairingCode().code).toBe(first.code);
  });

  test("a code works exactly once", () => {
    const { code } = issuePairingCode();
    expect(consumePairingCode(code)).toBe(true);
    expect(consumePairingCode(code)).toBe(false);
  });

  test("a wrong code is rejected and does not burn the real one", () => {
    const { code } = issuePairingCode();
    expect(consumePairingCode("not-the-code")).toBe(false);
    expect(consumePairingCode(code)).toBe(true);
  });

  test("codes expire after 5 minutes", () => {
    const now = Date.now();
    setSystemTime(new Date(now));
    const { code } = issuePairingCode();
    setSystemTime(new Date(now + 5 * 60 * 1000 + 1));
    expect(consumePairingCode(code)).toBe(false);
  });

  test("an expired code is replaced with a fresh one", () => {
    const now = Date.now();
    setSystemTime(new Date(now));
    const old = issuePairingCode();
    setSystemTime(new Date(now + 5 * 60 * 1000 + 1));
    const next = getPairingCode();
    expect(next.code).not.toBe(old.code);
    expect(next.expiresAt).toBeGreaterThan(Date.now());
  });

  test("rotating invalidates the previous code", () => {
    const old = issuePairingCode();
    issuePairingCode();
    expect(consumePairingCode(old.code)).toBe(false);
  });
});
