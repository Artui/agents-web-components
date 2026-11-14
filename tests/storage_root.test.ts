import { globSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STORAGE_ROOT } from "../src/constants.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";

describe("storage root", () => {
  it("is the package name", () => {
    expect(STORAGE_ROOT).toBe("agents-web-components");
  });

  it("roots the store's keys, namespaced or not", () => {
    new SessionStorageStore().setActiveThread("t1");
    new SessionStorageStore("app").setActiveThread("t2");
    expect(sessionStorage.getItem("agents-web-components:thread")).toBe("t1");
    expect(sessionStorage.getItem("agents-web-components@app:thread")).toBe("t2");
  });

  it("is the only place a key root is written out", () => {
    const offenders = globSync("src/**/*.ts")
      .filter((file) => !file.endsWith("constants.ts"))
      .filter((file) =>
        /["'`](ag-ui-chat|agents-web-components)(:[a-z]|@)/.test(readFileSync(file, "utf8")),
      );
    expect(offenders).toEqual([]);
  });
});
