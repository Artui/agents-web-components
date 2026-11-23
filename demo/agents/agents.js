// The agents home demo: one <ag-ui-agents> provider over two agents, a button
// per directory entry switching its chat, the inbox of every agent's threads,
// and an <ag-ui-threads> bound through the provider. /agents/?stream watches the
// inbox by SSE instead of polling.
import {
  AGENT_CHANGE_EVENT,
  AGENTS_CHANGE_EVENT,
  defineAgents,
  defineChat,
  INBOX_CHANGE_EVENT,
} from "/bundle.js";
import { defineThreads } from "/threads.bundle.js";

const home = document.getElementById("home");
if (new URLSearchParams(location.search).has("stream")) {
  home.setAttribute("data-inbox-transport", "stream");
}

const log = (text) => {
  const item = document.createElement("li");
  item.textContent = text;
  document.getElementById("log").prepend(item);
};

const drawAgents = () => {
  const group = document.getElementById("agents");
  group.replaceChildren(
    ...home.agents.map((agent) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = agent.name;
      button.title = agent.description;
      button.setAttribute("aria-pressed", String(agent.id === home.agent));
      button.addEventListener("click", () => {
        home.agent = agent.id;
      });
      return button;
    }),
  );
};

home.addEventListener(AGENTS_CHANGE_EVENT, (event) => {
  log(`ag-ui-agents-change: ${event.detail.agents.map((agent) => agent.id).join(", ")}`);
  drawAgents();
});
home.addEventListener(AGENT_CHANGE_EVENT, (event) => {
  log(`ag-ui-agent-change: ${event.detail.agent.id} (${event.detail.agent.endpoint})`);
  drawAgents();
});
home.addEventListener(INBOX_CHANGE_EVENT, (event) => {
  log(`ag-ui-inbox-change: ${event.detail.threads.length} rows`);
  document.getElementById("inbox").replaceChildren(
    ...event.detail.threads.map((row) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      const mark = row.status === undefined || row.status === "idle" ? "" : ` [${row.status}]`;
      button.textContent = `${row.agentId}: ${row.title}${mark}${row.unread ? " (unread)" : ""}`;
      button.addEventListener("click", () => {
        void home.openThread(row.agentId, row.threadId);
      });
      item.append(button);
      return item;
    }),
  );
});

defineAgents();
defineChat();
defineThreads();
