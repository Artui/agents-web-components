/**
 * The library build's two entries, loaded together the way a host loads them.
 *
 * A host imports the element from `./chat` and the page drivers from `.`, and
 * the two meet in module-level state: a free `flash()` reads the colour of the
 * most recently connected chat from the chat registry. Built without
 * splitting, each entry carries its own copy of that registry, so a chat
 * connected through one is invisible to a driver from the other and every ring
 * falls back to the package indigo.
 */

import { beforeAll, describe, expect, inject, it } from "vitest";
import type * as Chat from "../../src/chat.js";
import type * as Index from "../../src/index.js";

let index: typeof Index;
let chat: typeof Chat;

beforeAll(async () => {
  const dir = inject("libraryDir");
  // Dynamic, because the files do not exist until the global setup built them.
  index = (await import(/* @vite-ignore */ `/${dir}/index.js`)) as typeof Index;
  chat = (await import(/* @vite-ignore */ `/${dir}/chat.js`)) as typeof Chat;
  chat.defineChat();
});

/** A colour as Chromium serialises a computed `rgb()` with no alpha. */
const RING = "rgb(12, 160, 34)";

describe("the library entries", () => {
  it("share one module instance", async () => {
    const el = document.createElement(index.ELEMENT_TAG) as InstanceType<typeof chat.AgUiChat>;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("placement", "embedded");
    el.style.setProperty("--ag-ui-highlight-ring-color", RING);
    document.body.appendChild(el);
    const target = document.createElement("button");
    document.body.appendChild(target);

    const done = index.flash(target, { flashMs: 30 });
    const color = getComputedStyle(target).outlineColor;
    await done;

    expect(el).toBeInstanceOf(chat.AgUiChat);
    expect(color).toBe(RING);
  });
});
