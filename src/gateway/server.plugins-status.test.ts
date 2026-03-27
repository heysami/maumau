import { describe, expect, it } from "vitest";
import { connectOk, installGatewayTestHooks, rpcReq } from "./test-helpers.js";
import { withServer } from "./test-with-server.js";

installGatewayTestHooks({ scope: "suite" });

describe("gateway plugins.status", () => {
  it("returns discovered plugin inventory for operator.read clients", async () => {
    await withServer(async (ws) => {
      await connectOk(ws, { token: "secret", scopes: ["operator.read"] });
      const res = await rpcReq<{
        diagnostics?: Array<{
          level?: string;
          message?: string;
          pluginId?: string;
          source?: string;
        }>;
        plugins?: Array<{
          id?: string;
          name?: string;
          status?: string;
          origin?: string;
          source?: string;
        }>;
        workspaceDir?: string;
      }>(ws, "plugins.status", {});

      expect(res.ok).toBe(true);
      expect(
        typeof res.payload?.workspaceDir === "string" || res.payload?.workspaceDir === undefined,
      ).toBe(true);
      expect(Array.isArray(res.payload?.plugins)).toBe(true);
      expect(Array.isArray(res.payload?.diagnostics)).toBe(true);

      const first = res.payload?.plugins?.[0];
      if (first) {
        expect(typeof first.id).toBe("string");
        expect(typeof first.name).toBe("string");
        expect(typeof first.status).toBe("string");
        expect(typeof first.origin).toBe("string");
        expect(typeof first.source).toBe("string");
      }

      const diagnostic = res.payload?.diagnostics?.[0];
      if (diagnostic) {
        expect(typeof diagnostic.level).toBe("string");
        expect(typeof diagnostic.message).toBe("string");
      }
    });
  });
});
