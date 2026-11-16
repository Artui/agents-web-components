import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { A2UI_BUNDLE, LIBRARY, VENDORED_BUNDLE } from "../esbuild.config.mjs";
import * as a2ui from "../src/a2ui.js";
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

  it("publishes the A2UI renderer as its own entry and its own vendored file", () => {
    expect(Object.keys(a2ui)).toEqual(["registerA2ui"]);
    expect(MANIFEST.exports["./a2ui"]).toEqual({
      types: "./dist/a2ui.d.ts",
      import: "./dist/a2ui.js",
    });
    expect(A2UI_BUNDLE.entryPoints).toEqual(["src/a2ui.ts"]);
    expect(MANIFEST.exports["./a2ui/bundle"]).toEqual({
      types: "./dist/a2ui.d.ts",
      import: `./${A2UI_BUNDLE.outfile}`,
    });
  });

  it("keeps A2UI out of the main bundle", async () => {
    expect(Object.keys(bundle)).not.toContain("registerA2ui");
    const result = await build({ ...VENDORED_BUNDLE, write: false, metafile: true });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter((path) => path.startsWith("src/a2ui"))).toEqual([]);
  });

  it("keeps the element and the protocol packages out of the A2UI bundle", async () => {
    const result = await build({ ...A2UI_BUNDLE, write: false, metafile: true });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs).toContain("src/a2ui.ts");
    expect(
      inputs.filter(
        (path) =>
          path === "src/index.ts" ||
          path === "src/chat.ts" ||
          path === "src/core/ag_ui_chat.ts" ||
          path.includes("@ag-ui"),
      ),
    ).toEqual([]);
  });
});
