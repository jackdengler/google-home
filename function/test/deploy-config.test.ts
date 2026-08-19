import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cloud Function deployment config", () => {
  it("does not extend a TypeScript config outside the uploaded function directory", () => {
    const config = JSON.parse(
      readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"),
    ) as { extends?: string };

    expect(config.extends?.startsWith("../")).not.toBe(true);
  });
});
