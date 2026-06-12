import assert from "node:assert/strict";
import { describe, it, mock, afterEach } from "node:test";
import {
  clearSicofiTokenCacheForTests,
  getSicofiAccessToken,
  invalidateSicofiAccessToken,
} from "./sicofiAuth";

describe("sicofiAuth", () => {
  afterEach(() => {
    mock.restoreAll();
    clearSicofiTokenCacheForTests();
  });

  it("acepta respuesta Sicofi con campo token", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ token: "jwt-sicofi", expiration: 7200 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const base = "https://demo.sicofi.com.mx/DFWSR/api";
    const t = await getSicofiAccessToken(base, "u@test.com", "pass");
    assert.equal(t, "jwt-sicofi");
  });

  it("cachea token hasta expiración", async () => {
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const base = "https://demo.sicofi.com.mx/DFWSR/api";
    const t1 = await getSicofiAccessToken(base, "u@test.com", "pass");
    const t2 = await getSicofiAccessToken(base, "u@test.com", "pass");
    assert.equal(t1, "tok-1");
    assert.equal(t2, "tok-1");
    assert.equal(fetchCalls, 1);
  });

  it("invalidate fuerza refresh", async () => {
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ access_token: `tok-${fetchCalls}`, expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const base = "https://demo.sicofi.com.mx/DFWSR/api";
    const t1 = await getSicofiAccessToken(base, "u@test.com", "pass");
    invalidateSicofiAccessToken(base, "u@test.com");
    const t2 = await getSicofiAccessToken(base, "u@test.com", "pass");
    assert.equal(t1, "tok-1");
    assert.equal(t2, "tok-2");
    assert.equal(fetchCalls, 2);
  });
});
