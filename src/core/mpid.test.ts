import { describe, expect, it } from "vite-plus/test";
import { alphaToInt, mpUrl, normalizeMpId } from "./mpid";

describe("Materials Project ids", () => {
  // Reference values from emmet-core: AlphaID(n, padlen=8, prefix="mp") and AlphaID(...).string
  it("converts AlphaIDs to the legacy integer form up to the cut point", () => {
    expect(alphaToInt("aaaceqmj")).toBe(995393);
    expect(normalizeMpId("mp-aaaaaaaa")).toBe("mp-0");
    expect(normalizeMpId("mp-aaaaaaah")).toBe("mp-7");
    expect(normalizeMpId("mp-aaaaaabz")).toBe("mp-51");
    expect(normalizeMpId("mp-aaaceqmj")).toBe("mp-995393");
    expect(normalizeMpId("mp-aaacebzk")).toBe("mp-985592");
    expect(normalizeMpId("mp-aaahilzd")).toBe("mp-3347529");
    expect(normalizeMpId("MP-AAACEQMJ")).toBe("mp-995393");
    expect(normalizeMpId("mvc-aaaaaabz")).toBe("mvc-51");
  });

  it("keeps ids beyond the cut point, legacy ids and non-MP ids", () => {
    expect(normalizeMpId("mp-aaahilze")).toBe("mp-aaahilze");
    expect(normalizeMpId("mp-149")).toBe("mp-149");
    expect(normalizeMpId("demo-1")).toBe("demo-1");
    expect(normalizeMpId("mp-1234-GGA")).toBe("mp-1234-GGA");
  });

  it("links MP ids to their materials page", () => {
    expect(mpUrl("mp-aaaceqmj")).toBe("https://materialsproject.org/materials/mp-995393");
    expect(mpUrl("mp-149")).toBe("https://materialsproject.org/materials/mp-149");
    expect(mpUrl("demo-1")).toBeNull();
    expect(mpUrl("virtual")).toBeNull();
  });
});
