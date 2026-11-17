// The thread list demo: one chat, its conversations drawn twice by the host,
// as pills in the bar and as rows in a rail, both bound by for="chat".
import { defineChat, defineThreads } from "/bundle.js";

defineChat();
defineThreads();

const chat = document.getElementById("chat");

document.getElementById("new-chat").addEventListener("click", () => chat.newChat());

// Rows as a store with run status reports them. The built-in store keeps no
// status, so the demo adds it to the rows it lists.
const SEEDED = [
  { threadId: "demo-running", title: "Reconcile the March invoices", status: "running" },
  { threadId: "demo-waiting", title: "Archive last year's drafts", status: "waiting" },
  { threadId: "demo-failed", title: "Import the supplier price list", status: "failed" },
  { threadId: "demo-unread", title: "Summarise the board minutes", unread: true },
  { threadId: "demo-idle", title: "Draft the welcome email" },
];

document.getElementById("seed").addEventListener("click", async () => {
  const store = chat.conversationStore;
  for (const row of SEEDED) {
    store.saveMessages(row.threadId, [{ id: `u-${row.threadId}`, role: "user", content: row.title }]);
  }
  const list = store.listThreads.bind(store);
  store.listThreads = async () => {
    const rows = await list();
    return rows.map((row) => ({ ...row, ...SEEDED.find((seed) => seed.threadId === row.threadId) }));
  };
  for (const threads of document.querySelectorAll("ag-ui-threads")) {
    await threads.refresh();
  }
});
