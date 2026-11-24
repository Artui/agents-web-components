// Rolls up and proves the vendored bundle's declaration file is self-contained: a scratch
// project outside this repository, holding only the two files a vendoring
// host copies and no node_modules, type-checks an import of the element and
// its host seams. Run by `pnpm build` after the declarations are rolled up.
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";

export const VENDORED_JS = "agents-web-components.bundle.js";
export const VENDORED_DTS = "agents-web-components.bundle.d.ts";

const HOST = `import { type AgUiChat, defineChat } from "./vendor/agents-web-components.bundle.js";

defineChat();
const chat = document.createElement("ag-ui-chat") as AgUiChat;
chat.routeMap = [{ id: "home", path: "/", title: "Home" }];
chat.navigate = (path: string) => {
  history.pushState(null, "", path);
};
chat.getPageMap = () => ({ title: document.title });
chat.getPlace = () => null;
chat.enableCharts(["tool", "activity"]);
// @ts-expect-error the route is not a chart route, so the types are not any
chat.enableCharts(["neither"]);
// @ts-expect-error a route needs an id
chat.routeMap = [{ path: "/" }];
`;

const TSCONFIG = {
  compilerOptions: {
    target: "es2022",
    module: "esnext",
    moduleResolution: "bundler",
    lib: ["es2022", "dom", "dom.iterable"],
    types: [],
    strict: true,
    noEmit: true,
    skipLibCheck: false,
  },
  include: ["host.ts", "vendor/*.d.ts"],
};

/** Type-check a vendoring host against `distDir`'s bundle; throws with tsc's output on failure. */
export async function checkBundleTypes(distDir = "dist", root = process.cwd()) {
  const dts = await readFile(resolve(root, distDir, VENDORED_DTS), "utf8");
  const code = dts.replace(/\/\*[\s\S]*?\*\//g, "");
  const bare = [
    ...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|reference types=)["']([^"'./][^"']*)["']/g),
  ].map((match) => match[1]);
  if (bare.length > 0) {
    throw new Error(`${VENDORED_DTS} still imports ${[...new Set(bare)].join(", ")}`);
  }
  const host = await mkdtemp(join(tmpdir(), "awc-vendored-types-"));
  try {
    await mkdir(join(host, "vendor"));
    for (const file of [VENDORED_JS, VENDORED_DTS]) {
      await copyFile(resolve(root, distDir, file), join(host, "vendor", file));
    }
    await writeFile(join(host, "host.ts"), HOST);
    await writeFile(join(host, "tsconfig.json"), JSON.stringify(TSCONFIG));
    const tsc = resolve(root, "node_modules", ".bin", "tsc");
    try {
      execFileSync(tsc, ["-p", join(host, "tsconfig.json")], { cwd: host, stdio: "pipe" });
    } catch (error) {
      throw new Error(`the vendored declarations do not type-check alone:\n${error.stdout}`);
    }
  } finally {
    await rm(host, { recursive: true, force: true });
  }
}

/**
 * The packages the vendored bundle inlines as code, so their types are inlined
 * too; any other bare import left in the roll-up fails the check above.
 */
export const INLINED_PACKAGES = ["@ag-ui/core", "@ag-ui/client", "dompurify", "rxjs"];

/** Roll `dist/bundle.d.ts` and the tree it reaches up into one file beside the bundle. */
export function rollUpBundleTypes(distDir = "dist", root = process.cwd()) {
  const config = ExtractorConfig.prepare({
    configObject: {
      projectFolder: resolve(root),
      mainEntryPointFilePath: resolve(root, distDir, "bundle.d.ts"),
      bundledPackages: INLINED_PACKAGES,
      compiler: { tsconfigFilePath: resolve(root, "tsconfig.build.json") },
      apiReport: { enabled: false },
      docModel: { enabled: false },
      tsdocMetadata: { enabled: false },
      dtsRollup: {
        enabled: true,
        untrimmedFilePath: resolve(root, distDir, VENDORED_DTS),
      },
      messages: {
        compilerMessageReporting: { default: { logLevel: "warning" } },
        extractorMessageReporting: {
          default: { logLevel: "warning" },
          "ae-missing-release-tag": { logLevel: "none" },
          "ae-forgotten-export": { logLevel: "none" },
          "ae-unresolved-link": { logLevel: "none" },
        },
        tsdocMessageReporting: { default: { logLevel: "none" } },
      },
    },
    configObjectFullPath: resolve(root, "api-extractor.json"),
    packageJsonFullPath: resolve(root, "package.json"),
  });
  const result = Extractor.invoke(config, { localBuild: true, showVerboseMessages: false });
  if (!result.succeeded) {
    throw new Error(`api-extractor failed with ${result.errorCount} error(s)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  rollUpBundleTypes();
  await checkBundleTypes();
}
