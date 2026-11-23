import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import * as buildConfig from "../esbuild.config.mjs";
import {
  A2UI_BUNDLE,
  INBOX_BUNDLE,
  LIBRARY,
  MCP_APPS_BUNDLE,
  THREADS_BUNDLE,
  VENDORED_BUNDLE,
} from "../esbuild.config.mjs";
import * as a2ui from "../src/a2ui.js";
import * as bundle from "../src/bundle.js";
import * as chat from "../src/chat.js";
import { ELEMENT_TAG } from "../src/constants.js";
import * as inbox from "../src/inbox.js";
import * as index from "../src/index.js";
import * as mcpApps from "../src/mcp_apps.js";
import * as threads from "../src/threads.js";

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

  it("publishes the thread list as its own entry and its own vendored file", () => {
    expect(Object.keys(threads).sort()).toEqual([
      "AgUiThreads",
      "THREADS_SELECT_EVENT",
      "THREADS_TAG",
      "defineThreads",
    ]);
    expect(Object.keys(index).filter((name) => name in threads)).toEqual([]);
    expect(MANIFEST.exports["./threads"]).toEqual({
      types: "./dist/threads.d.ts",
      import: "./dist/threads.js",
    });
    expect(THREADS_BUNDLE.entryPoints).toEqual(["src/threads.ts"]);
    expect(MANIFEST.exports["./threads/bundle"]).toEqual({
      types: "./dist/threads.d.ts",
      import: `./${THREADS_BUNDLE.outfile}`,
    });
  });

  it("keeps the thread list out of the main bundle", async () => {
    expect(Object.keys(bundle)).not.toContain("defineThreads");
    expect(Object.keys(bundle)).not.toContain("AgUiThreads");
    const result = await build({ ...VENDORED_BUNDLE, write: false, metafile: true });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter((path) => path.startsWith("src/threads"))).toEqual([]);
  });

  it("keeps the element, its string table and the protocol packages out of the threads bundle", async () => {
    const result = await build({ ...THREADS_BUNDLE, write: false, metafile: true });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs).toContain("src/threads.ts");
    expect(
      inputs.filter(
        (path) =>
          path === "src/index.ts" ||
          path === "src/chat.ts" ||
          path === "src/core/ag_ui_chat.ts" ||
          path === "src/ui/ui_strings.ts" ||
          path.startsWith("src/a2ui") ||
          path.startsWith("src/mcp_apps") ||
          path.includes("@ag-ui"),
      ),
    ).toEqual([]);
  });

  it("publishes the inbox as its own entry and its own vendored file", () => {
    expect(Object.keys(inbox).sort()).toEqual([
      "AgUiInbox",
      "INBOX_ANSWER_EVENT",
      "INBOX_SELECT_EVENT",
      "INBOX_TAG",
      "defineInbox",
    ]);
    expect(Object.keys(index).filter((name) => name in inbox)).toEqual([]);
    expect(MANIFEST.exports["./inbox"]).toEqual({
      types: "./dist/inbox.d.ts",
      import: "./dist/inbox.js",
    });
    expect(INBOX_BUNDLE.entryPoints).toEqual(["src/inbox.ts"]);
    expect(MANIFEST.exports["./inbox/bundle"]).toEqual({
      types: "./dist/inbox.d.ts",
      import: `./${INBOX_BUNDLE.outfile}`,
    });
  });

  it("keeps the inbox out of the main bundle", async () => {
    expect(Object.keys(bundle)).not.toContain("defineInbox");
    expect(Object.keys(bundle)).not.toContain("AgUiInbox");
    const result = await build({ ...VENDORED_BUNDLE, write: false, metafile: true });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter((path) => path.startsWith("src/inbox"))).toEqual([]);
  });

  it("keeps the element, its string table and the protocol packages out of the inbox bundle", async () => {
    const result = await build({ ...INBOX_BUNDLE, write: false, metafile: true });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs).toContain("src/inbox.ts");
    expect(
      inputs.filter(
        (path) =>
          path === "src/index.ts" ||
          path === "src/chat.ts" ||
          path === "src/core/ag_ui_chat.ts" ||
          path === "src/agents/ag_ui_agents.ts" ||
          path === "src/ui/ui_strings.ts" ||
          path.startsWith("src/a2ui") ||
          path.startsWith("src/mcp_apps") ||
          path.startsWith("src/threads") ||
          path.includes("@ag-ui"),
      ),
    ).toEqual([]);
  });

  it("defines nothing at import", () => {
    expect(customElements.get(ELEMENT_TAG)).toBeUndefined();
    expect(customElements.get(threads.THREADS_TAG)).toBeUndefined();
    expect(customElements.get(inbox.INBOX_TAG)).toBeUndefined();
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

  it("publishes the MCP Apps host as its own entry and its own vendored file", () => {
    expect(Object.keys(mcpApps)).toEqual(["registerMcpApps"]);
    expect(MANIFEST.exports["./mcp-apps"]).toEqual({
      types: "./dist/mcp_apps.d.ts",
      import: "./dist/mcp_apps.js",
    });
    expect(MCP_APPS_BUNDLE.entryPoints).toEqual(["src/mcp_apps.ts"]);
    expect(MANIFEST.exports["./mcp-apps/bundle"]).toEqual({
      types: "./dist/mcp_apps.d.ts",
      import: `./${MCP_APPS_BUNDLE.outfile}`,
    });
  });

  it("ships the sandbox proxy page as one static file under its own export", async () => {
    const exported: unknown = MANIFEST.exports["./mcp-apps/sandbox-proxy.html"];
    expect(exported).toBe(`./${buildConfig.SANDBOX_PROXY_PAGE}`);
    const dir = await mkdtemp(join(tmpdir(), "sandbox-proxy-"));
    try {
      await buildConfig.buildSandboxProxyPage(join(dir, "page.html"));
      const page = await readFile(join(dir, "page.html"), "utf8");
      expect(page.startsWith("<!doctype html>")).toBe(true);
      expect(page).not.toMatch(/<script[^>]*\ssrc=/);
      expect(page.match(/<script>/g)).toHaveLength(1);
      expect(page).toContain("ui/notifications/sandbox-proxy-ready");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps MCP Apps out of the main bundle", async () => {
    expect(Object.keys(bundle)).not.toContain("registerMcpApps");
    const result = await build({ ...VENDORED_BUNDLE, write: false, metafile: true });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter((path) => path.startsWith("src/mcp_apps"))).toEqual([]);
  });

  it("keeps the element, its string table and the protocol packages out of the MCP Apps bundle", async () => {
    const result = await build({ ...MCP_APPS_BUNDLE, write: false, metafile: true });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs).toContain("src/mcp_apps.ts");
    expect(
      inputs.filter(
        (path) =>
          path === "src/index.ts" ||
          path === "src/chat.ts" ||
          path === "src/core/ag_ui_chat.ts" ||
          path === "src/ui/ui_strings.ts" ||
          // A view's ui/open-link goes through A2UI's URL check, a leaf with no imports.
          (path.startsWith("src/a2ui") && path !== "src/a2ui/safe_url.ts") ||
          path.includes("@ag-ui"),
      ),
    ).toEqual([]);
  });
});
