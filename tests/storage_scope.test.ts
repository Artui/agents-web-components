/**
 * Which store a principal change may replace.
 *
 * The element's own `sessionStorage` store is the only one it knows the keying
 * of, so it is the only one it may rebuild under another namespace. Anything
 * the host assigned holds its data somewhere the element cannot see and scopes
 * itself -- including a store assigned after the element's own one was handed
 * out, which is the case connecting cannot see.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClientConversationStore,
  SessionStorageStore,
} from "../src/core/conversation_store.js";
import { StorageScope } from "../src/core/storage_scope.js";

function scope(): StorageScope {
  const owned = new StorageScope({ id: () => "chat", endpoint: () => "/agent/" });
  owned.claim();
  return owned;
}

let claimed: StorageScope | null = null;

afterEach(() => {
  claimed?.release();
  claimed = null;
});

describe("StorageScope.rescopeStore", () => {
  it("rebuilds the store it handed out under the new namespace", () => {
    claimed = scope();
    const handed = claimed.scopeStore(new SessionStorageStore(), "alice");

    const next = claimed.rescopeStore(handed, claimed.conversationNamespace("bob"));

    expect(next).toBeInstanceOf(SessionStorageStore);
    expect(next).not.toBe(handed);
    // And the rebuilt one is now the store it answers for.
    expect(claimed.rescopeStore(next as ClientConversationStore, "chat#carol")).not.toBeNull();
  });

  it("refuses a store it did not hand out, even after handing one out", () => {
    // Connecting remembered the element's own store; the host assigned another
    // since. Remembering is not the same as still being in use.
    claimed = scope();
    claimed.scopeStore(new SessionStorageStore(), "alice");

    expect(claimed.rescopeStore(new SessionStorageStore("host"), "chat#bob")).toBeNull();
  });

  it("refuses when connecting met a store of the host's own kind", () => {
    claimed = scope();
    const injected = { threadId: () => "host-thread" } as unknown as ClientConversationStore;
    expect(claimed.scopeStore(injected, "alice")).toBe(injected);

    expect(claimed.rescopeStore(injected, "chat#bob")).toBeNull();
  });
});

describe("StorageScope.writePreference", () => {
  it("warns once per scope when the browser refuses every write", () => {
    const first = new StorageScope({ id: () => "a", endpoint: () => "" });
    const second = new StorageScope({ id: () => "b", endpoint: () => "" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const real = sessionStorage;
    vi.stubGlobal(
      "sessionStorage",
      new Proxy(real, {
        get(target, property) {
          if (property === "setItem") {
            return () => {
              throw new DOMException("exceeded the quota", "QuotaExceededError");
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    );

    for (const owner of [first, second, first, second]) {
      owner.writePreference("size", "1");
    }

    // A resize writes on every step: one warning per element, not one per step.
    expect(warn).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
    warn.mockRestore();
  });
});
