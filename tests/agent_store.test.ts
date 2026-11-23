import { afterEach, describe, expect, it } from "vitest";
import { AgentStore } from "../src/agents/agent_store.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { StorageScope } from "../src/core/storage_scope.js";

afterEach(() => {
  sessionStorage.clear();
});

function keys(): string[] {
  return Object.keys(sessionStorage);
}

describe("AgentStore", () => {
  it("keeps an agent's conversation under the agent's own namespace", () => {
    const store = new AgentStore("board");
    store.setActiveThread("t1");

    expect(store).toBeInstanceOf(SessionStorageStore);
    expect(store.agentId).toBe("board");
    expect(AgentStore.namespaceOf("board")).toBe("agent:board");
    expect(keys().every((key) => key.startsWith("agents-web-components@agent:board:"))).toBe(true);
    expect(keys()).not.toEqual([]);
  });
});

describe("StorageScope over an agent's store", () => {
  function scope(): StorageScope {
    const owned = new StorageScope({ id: () => "chat", endpoint: () => "/agent/" });
    owned.claim();
    return owned;
  }

  it("moves the conversation onto the agent, principal included", () => {
    const owned = scope();
    const handed = owned.scopeStore(new AgentStore("board"), "alice");

    expect(handed).toBeInstanceOf(AgentStore);
    expect((handed as AgentStore).agentId).toBe("board");
    expect(owned.conversationNamespace("")).toBe("agent:board");
    expect(owned.conversationNamespace("alice")).toBe("agent:board#alice");
    handed.setActiveThread("t1");
    expect(keys().every((key) => key.startsWith("agents-web-components@agent:board#alice:"))).toBe(
      true,
    );
    // The element's own layout keys stay on the element's namespace.
    expect(owned.key("collapsed")).toBe("collapsed:chat");
    owned.release();
  });

  it("rebuilds an agent's store as an agent's store on a principal change", () => {
    const owned = scope();
    const handed = owned.scopeStore(new AgentStore("board"), "alice");

    const next = owned.rescopeStore(handed, owned.conversationNamespace("bob"));

    expect(next).toBeInstanceOf(AgentStore);
    expect((next as AgentStore).agentId).toBe("board");
    owned.release();
  });

  it("goes back to the element's namespace when the store is no longer an agent's", () => {
    const owned = scope();
    owned.scopeStore(new AgentStore("board"), "");
    const handed = owned.scopeStore(new SessionStorageStore(), "");

    expect(handed).not.toBeInstanceOf(AgentStore);
    expect(owned.conversationNamespace("")).toBe("chat");
    expect(owned.rescopeStore(handed, "chat#bob")).not.toBeInstanceOf(AgentStore);
    owned.release();
  });
});
