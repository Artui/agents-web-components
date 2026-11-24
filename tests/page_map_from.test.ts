import { describe, expect, it } from "vitest";
import { AgUiChat } from "../src/core/ag_ui_chat.js";
import * as root from "../src/index.js";

describe("pageMapFrom at the root", () => {
  it("is exported with its resolver and names, and is never the default provider", () => {
    expect(typeof root.pageMapFrom).toBe("function");
    expect(typeof root.resolvePageMapHandle).toBe("function");
    expect(root.PAGE_MAP_HANDLE_ATTRIBUTE).toBe("data-agent-handle");
    expect(root.PAGE_MAP_IGNORE_ATTRIBUTE).toBe("data-agent-ignore");
    if (!customElements.get("ag-ui-chat")) {
      customElements.define("ag-ui-chat", AgUiChat);
    }
    expect((document.createElement("ag-ui-chat") as AgUiChat).getPageMap).toBeNull();
  });
});
