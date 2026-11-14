import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { TestProject } from "vitest/node";
import { LIBRARY } from "../../esbuild.config.mjs";

declare module "vitest" {
  interface ProvidedContext {
    /** Where the library build was written, as a path from the repository root. */
    libraryDir: string;
  }
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Gitignored, and apart from `dist/`, so a test run never leaves a build a release could pick up. */
const OUT = ".vitest/library";

/**
 * Build the library for `library_entries.browser.test.ts`, from the options
 * `esbuild.config.mjs` builds with.
 *
 * Unlike the vendored bundle this cannot cross by `provide`: its entries import
 * their shared chunks by relative path and `@ag-ui/*` by bare name, so the test
 * imports the files through Vite, the way a consumer's bundler would. No
 * sourcemap, so the built files add nothing to the coverage of `src/`.
 */
export default async function setup(project: TestProject): Promise<void> {
  await rm(resolve(ROOT, OUT), { recursive: true, force: true });
  await build({ ...LIBRARY, outdir: OUT, sourcemap: false, absWorkingDir: ROOT });
  project.provide("libraryDir", OUT);
}
