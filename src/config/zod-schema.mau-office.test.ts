import { describe, expect, it } from "vitest";
import { MaumauSchema } from "./zod-schema.js";

describe("MaumauSchema MauOffice scene validation", () => {
  it("accepts browser and telephony zones plus their marker roles", () => {
    const result = MaumauSchema.safeParse({
      ui: {
        mauOffice: {
          scene: {
            version: 1,
            zoneRows: [
              ["browser", "browser"],
              ["telephony", "hall"],
            ],
            wallRows: [
              [false, false],
              [false, false],
            ],
            markers: [
              {
                id: "browser-worker-1",
                role: "browser.workerSeat",
                tileX: 0,
                tileY: 0,
                pose: "sit",
                layer: 0,
              },
              {
                id: "telephony-staff-1",
                role: "telephony.staff",
                tileX: 0,
                tileY: 1,
                pose: "stand",
                layer: 0,
              },
            ],
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });
});
