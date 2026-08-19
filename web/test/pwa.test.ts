import { describe, expect, it } from "vitest";
import { pwaManifest, workboxOptions } from "../src/pwa.js";

describe("PWA contract", () => {
  it("installs standalone with maskable phone icons", () => {
    expect(pwaManifest).toMatchObject({ name: "Nest Dial", display: "standalone", start_url: "/google-home/", scope: "/google-home/" });
    expect(pwaManifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any maskable" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any maskable" }),
    ]));
  });

  it("never adds API responses to runtime caching", () => {
    expect(workboxOptions.runtimeCaching ?? []).toHaveLength(0);
    expect(workboxOptions.navigateFallback).toBe("/google-home/index.html");
  });
});
