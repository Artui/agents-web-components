import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIBRARY, VENDORED_BUNDLE } from "../esbuild.config.mjs";
import * as bundle from "../src/bundle.js";
import * as chat from "../src/chat.js";
import { ELEMENT_TAG } from "../src/constants.js";
import * as index from "../src/index.js";

interface Manifest {
  readonly exports: Record<string, { readonly types?: string; readonly import: string }>;
  readonly sideEffects: boolean;
}

const MANIFEST = JSON.parse(readFileSync("package.json", "utf8")) as Manifest;

describe("the package entries", () => {
  it("puts the element in ./chat and nowhere else but the bundle", () => {
    expect(Object.keys(chat).sort()).toEqual(["AgUiChat", "defineChat"]);
    expect(Object.keys(index).filter((name) => name in chat)).toEqual([]);
  });

  it("bundles every export of both entries", () => {
    expect(Object.keys(bundle).sort()).toEqual(
      [...Object.keys(index), ...Object.keys(chat)].sort(),
    );
  });

  it("defines nothing at import", () => {
    expect(customElements.get(ELEMENT_TAG)).toBeUndefined();
  });

  it("declares itself free of import side effects", () => {
    expect(MANIFEST.sideEffects).toBe(false);
  });

  it("publishes each library entry under its own export", () => {
    const published = Object.values(MANIFEST.exports).map((target) => target.import);
    for (const entry of LIBRARY.entryPoints as string[]) {
      const name = entry.replace(/^src\//, "").replace(/\.ts$/, "");
      expect(published).toContain(`./dist/${name}.js`);
    }
    expect(MANIFEST.exports["./chat"]).toEqual({
      types: "./dist/chat.d.ts",
      import: "./dist/chat.js",
    });
  });

  it("builds the vendored bundle from the bundle entry alone", () => {
    expect(VENDORED_BUNDLE.entryPoints).toEqual(["src/bundle.ts"]);
    expect(MANIFEST.exports["./bundle"]).toEqual({
      types: "./dist/bundle.d.ts",
      import: `./${VENDORED_BUNDLE.outfile}`,
    });
  });
});
