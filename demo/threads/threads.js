// The thread list demo: one chat, its conversations drawn twice by the host,
// as rows in a rail bound by for="chat" and as pills in the bar bound through
// the chat property.
import { defineChat } from "/bundle.js";
import { defineThreads } from "/threads.bundle.js";

const chat = document.getElementById("chat");
// /threads/?status (or ?status=stream) lists threads from a server that reports
// run status, and watches it, so each row carries its mark. Set before the
// element is defined, since data-threads-url is read while it connects.
const status = new URLSearchParams(location.search).get("status");
if (status !== null) {
  chat.setAttribute("data-threads-url", "/status/threads/");
  chat.setAttribute("data-thread-status", status === "stream" ? "stream" : "poll");
}

defineChat();
defineThreads();
document.getElementById("pills").chat = chat;

document.getElementById("new-chat").addEventListener("click", () => chat.newChat());

const SEEDED = [
  { threadId: "demo-invoices", title: "Reconcile the March invoices" },
  { threadId: "demo-drafts", title: "Archive last year's drafts" },
  { threadId: "demo-prices", title: "Import the supplier price list" },
  { threadId: "demo-minutes", title: "Summarise the board minutes" },
  { threadId: "demo-welcome", title: "Draft the welcome email" },
];

document.getElementById("seed").addEventListener("click", async () => {
  for (const row of SEEDED) {
    chat.conversationStore.saveMessages(row.threadId, [
      { id: `u-${row.threadId}`, role: "user", content: row.title },
    ]);
  }
  for (const threads of document.querySelectorAll("ag-ui-threads")) {
    await threads.refresh();
  }
});
