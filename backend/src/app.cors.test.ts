import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { createApp } from "./app";

function restoreEnv(key: "CORS_ORIGIN" | "NODE_ENV", value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("CORS de descargas", () => {
  it("expone Content-Disposition para que el front use el nombre del archivo", async () => {
    const prevOrigin = process.env.CORS_ORIGIN;
    const prevNode = process.env.NODE_ENV;
    process.env.CORS_ORIGIN = "https://pruebas-tlo.example";
    process.env.NODE_ENV = "production";
    const app = createApp();
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: "https://pruebas-tlo.example" },
      });
      assert.equal(res.status, 200);
      assert.match(res.headers.get("access-control-expose-headers") ?? "", /content-disposition/i);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      restoreEnv("CORS_ORIGIN", prevOrigin);
      restoreEnv("NODE_ENV", prevNode);
    }
  });
});
