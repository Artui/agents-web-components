# File uploads

Set **`data-attachments-url`** (django-ag-ui's `AttachmentsView`) to let the user attach files
to a message. A button, drag-and-drop, and **paste** appear on the composer; each picked file uploads
out-of-band (multipart, with the element's `headers`) and shows a chip in a pending tray —
`uploading` (with a progress bar) → `ready`, or `error` with a retry. On send, the ready files'
**refs** ride on the user bubble as read-only chips and the agent reads their contents
server-side via the `read_attachment` tool. The wire stays vanilla AG-UI: only lightweight refs
(`{ id, name, mime, size }`) travel, never the bytes, in the user message's `metadata` under
`attachments` — the one place on a message `@ag-ui/client` 1.0 does not strip an unknown key from.
django-ag-ui reads them from there as of 0.63.0; an older one reads only the top-level key 1.0
removes, so against it the agent is never told a file was attached.

## Pasting

A paste carrying files puts them on the tray, the same way the picker and a drop
do — a screenshot straight from the clipboard, or a file copied in the file
manager.

Two rules keep it from stealing a paste that was never about files. Text pastes
carry no files at all, so ordinary pasting is untouched. And the default is
prevented **only when the clipboard carries no text**: copying a rich selection
that happens to contain an image puts both on the clipboard, and swallowing the
words someone meant to paste in order to attach a picture they did not is the
worse of the two failures.

A pasted blob that arrives with no filename — some engines hand one over that
way — is given one, rather than reaching the server as an empty `filename` and
showing in the tray as a chip with no label.

```html
<ag-ui-chat
  endpoint="/agent/"
  data-attachments-url="/agent/attachments/"
  data-attachment-accept="image/*,application/pdf,text/plain"
  data-attachment-max-bytes="10485760"
></ag-ui-chat>
```

Client-side `accept` / size checks are an instant-feedback nicety — **the server is
authoritative**. Refs persist on the message, so a restored conversation re-renders its chips.
Without the attribute the affordance stays hidden and the chat is text-only.

The built-in handler sends the element's `headers` / `getHeaders` with every upload, and honours
`credentials="include"` — with the caveat that it is an `XMLHttpRequest` (for real progress
events), whose cookie switch is two-state: `include` turns it on, every other value leaves it off.
See [Authenticating requests](authentication.md#authenticating-requests).

**Swapping the upload transport.** The built-in multipart `POST` is just the default
`uploadHandler`. Set your own to use a different transport — a resumable
[`tus-js-client`](https://github.com/tus/tus-js-client) adapter, direct-to-S3 multipart, etc.
— without touching the tray, the chips, or the AG-UI wire (refs are transport-agnostic). The
handler is `(file, onProgress) => Promise<AttachmentRef>`; when set, the affordance appears
even with no `data-attachments-url`, and your handler owns its own endpoint and headers:

```js
import { Upload } from "tus-js-client";

chat.uploadHandler = (file, onProgress) =>
  new Promise((resolve, reject) => {
    const up = new Upload(file, {
      endpoint: "/tus/",
      headers: chat.headers,
      onProgress: (sent, total) => onProgress(sent / total),
      onError: reject,
      onSuccess: () =>
        resolve({ id: up.url.split("/").pop(), name: file.name, mime: file.type, size: file.size }),
    });
    up.start();
  });
```

The server side is the matching half: the agent reads bytes by ref id, so point the
`read_attachment` store at wherever your transport persisted them (django-ag-ui's
`AttachmentStore` is the seam). The refs themselves never change shape.
