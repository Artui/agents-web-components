# The threads contract

`data-threads-url` points the chat at a server that keeps conversations. This page is the
contract that server answers: what `RemoteConversationStore` (the store the attribute builds)
asks for, and what it reads from the answers. It is written from the reference producer,
django-ag-ui's `ThreadsView` (0.89.0), and split into what the component **requires** and what
django-ag-ui **adds**. Any server that keeps to the first part works.

Every example below is quoted from `tests/fixtures/thread_status.json`, recorded by
`scripts/record_thread_status_fixture.py` against django-ag-ui 0.89.0 installed from PyPI, with
timestamps, ids and ETags replaced by stable stand-ins (`etag-1`, `id-2`, times in order).

## Routes

`<url>` is the attribute's value, ending in a slash (`/agent/threads/`); `<id>` is the thread id,
URL-encoded. Every request carries the host's [headers and credentials](authentication.md).

| Route | Answers | Required by the component |
| --- | --- | --- |
| `GET <url>` | `200 {"threads": [row, ...]}` | yes: the conversation list |
| `GET <url><id>/` | `200 {"thread_id", "messages": [...]}`; `404 {"error": "not found"}` | yes: opening a thread |
| `PATCH <url><id>/` with `{"title"}` | `200 {"thread_id", "title"}`; `400` on an empty title; `404` | rename |
| `DELETE <url><id>/` | `204`; django-ag-ui answers `409` when cancelling a child session fails | delete |
| `POST <url><id>/read/` | `204`, or `404` | only beside a run store (see [thread status](#thread-status-keys)) |
| `GET <url><id>/children/` | `200 {"children": [...]}`, `404` | django-ag-ui only |

An auth refusal is the server's own `401` or `403`; django-ag-ui routes it through the same auth
seam as the agent endpoint. `?limit=` on the list is clamped by django-ag-ui to its configured
cap, so a client cannot ask for more than the server allows.

## The list

`GET <url>` answers `200` with `{"threads": [...]}`, newest first as the server orders them.

### Row keys every server sends

| Key | Type | Meaning |
| --- | --- | --- |
| `thread_id` | string | The id the detail and mutation routes take. |
| `title` | string | Shown in the list. |
| `updated_at` | ISO 8601 string or `null` | Sorts and dates the row. |
| `preview` | string | A line of the latest message with text, from any role. |

### Thread status keys

Only beside a run store. A row carries `status` (`idle`, `running`, `waiting` or `failed`) and
`last_read_at` (ISO 8601, or `null` for a thread never read, which the component shows unread
unless it is running); `reason` (string or `null`) only when `failed`;
`interrupts` only when `waiting`, each an AG-UI `Interrupt` in camelCase.

A waiting approval, as recorded:

```json
{
  "thread_id": "t-approve",
  "title": "Please delete invoice 7",
  "updated_at": "2026-01-01T00:00:04.000000+00:00",
  "preview": "Please delete invoice 7",
  "parent": null,
  "routine": null,
  "agent_id": "helper",
  "status": "waiting",
  "last_read_at": null,
  "interrupts": [
    {
      "id": "int-call-1",
      "reason": "tool_call",
      "message": "delete_invoice",
      "toolCallId": "call-1",
      "metadata": {
        "destructive": true,
        "kind": "approval"
      }
    }
  ],
  "run_id": "r3"
}
```

A failed row, and an idle one that has been read:

```json
{
  "thread_id": "t-failed",
  "title": "Please fail",
  "updated_at": "2026-01-01T00:00:06.000000+00:00",
  "preview": "Please fail",
  "parent": null,
  "routine": null,
  "agent_id": "helper",
  "status": "failed",
  "last_read_at": null,
  "reason": "error"
}
```

```json
{
  "thread_id": "t-read",
  "title": "Hello",
  "updated_at": "2026-01-01T00:00:02.000000+00:00",
  "preview": "partial answer and the rest",
  "parent": null,
  "routine": null,
  "agent_id": "helper",
  "status": "idle",
  "last_read_at": "2026-01-01T00:00:01.000000+00:00"
}
```

An interrupt has `id` (`int-<toolCallId>`), `reason` (`tool_call`), `message`, `toolCallId` and
`metadata` of `{"destructive": bool, "kind": "approval" | "question" | "external"}`. django-ag-ui
writes the approval prompt (or the tool name) as `message`. A server that keeps the raw call in
`message` may add the prompt as `metadata["x-confirm"]`: the inbox words an approval row by it.

A listing whose rows carry no `status` means the server has no run store. The component then
sends no `read/` POST and never asks for interrupts.

### What django-ag-ui adds

Optional. The component works without each, and each is read by one feature:

| Key | Where | Read by |
| --- | --- | --- |
| `run_id` | a `waiting` row, only when the mount can resume runs (a step store) | the inbox's in-place answer, which resumes that run |
| `agent_id` | every row of a mount with an id, beside a run store | the [agents provider](agents.md#several-agents-under-one-provider)'s inbox, to say which agent owns a row |
| `parent` | `{"thread_id", "scope"}` for a child session, else `null` (always sent) | child sessions listed under their parent thread |
| `routine` | `{"id", "name"}` for a thread a routine fired, else `null` (always sent) | the routine's name on the row |
| top-level `agent` | `{"id", "name", "description"}`, beside `threads` | nothing: it names the mount that answered, and the component takes agents from its own directory route |
| `GET <url><id>/children/` | rows of `thread_id`, `agent_id` and status keys | not read by the component |

The mount's identity object, as recorded:

```json
{
  "id": "helper",
  "name": "Helper",
  "description": "Answers questions."
}
```

## Caching: ETag and 304

The list is the polled and streamed resource, so it is conditional.

- The server sends a strong `ETag` over the body, `Cache-Control: private, no-cache` and
  `Vary: Accept`.
- `If-None-Match` carrying that ETag, `*`, or the ETag weakened (`W/`) answers `304` with the
  ETag and no body.
- The component keeps its last listing with its ETag. A `304` reuses that listing. A `200` without
  an `ETag` header is kept as **no listing**: the next list is a full `GET`, and
  `waitingInterrupts` asks the server every time.

The recorded `304`:

```json
{
  "status": 304,
  "etag": "\"etag-1\"",
  "body": null
}
```

## The stream

A list request with `Accept: text/event-stream` is the live form (`data-thread-status="stream"`).

- Under ASGI the server answers frames of `id: <etag>`, then `data: <the list body>`, then a blank
  line; `Last-Event-ID` naming the current ETag skips the unchanged first frame, so a reconnect
  sends nothing until the list changes. It sends a comment heartbeat when configured and ends
  after five minutes so the client reconnects and authenticates again.
- Under WSGI the same request answers plain JSON. The component sees `application/json` and polls
  instead.

One recorded frame (the body is abbreviated here; the fixture holds the whole frame):

```text
id: "etag-2"
data: {"threads":[...],"agent":{...}}
```

The same request with that frame's ETag as `Last-Event-ID` sent no first frame within the
recorder's wait (`streamSkipped` is `null`). Under WSGI the answer was `200`
with content type `application/json`.

## The detail

`GET <url><id>/` answers `200` with `{"thread_id", "messages": [...]}`, the AG-UI messages in
camelCase, in order. A missing thread, and another user's thread, are the same answer:

```json
{
  "status": 404,
  "etag": null,
  "body": {
    "error": "not found"
  }
}
```

The component falls back to its local cache on any non-OK answer, and never asks for a thread it
minted and has not sent, so a first visit does not cost a `404`.

A thread whose last run finished, as recorded:

```json
{
  "thread_id": "t-approve",
  "messages": [
    {
      "id": "u-r3",
      "role": "user",
      "content": "Please delete invoice 7"
    },
    {
      "id": "id-2",
      "role": "assistant",
      "toolCalls": [
        {
          "id": "call-1",
          "type": "function",
          "function": {
            "name": "delete_invoice",
            "arguments": "{\"target\":\"invoice-7\"}"
          }
        }
      ]
    },
    {
      "id": "id-3",
      "role": "tool",
      "content": "deleted invoice-7",
      "toolCallId": "call-1"
    },
    {
      "id": "id-4",
      "role": "assistant",
      "content": "Deleted."
    }
  ]
}
```

### Restoring a waiting approval

The component offers the approval card for a waiting thread only when **every** interrupt of the
row has a `toolCallId` and `metadata.kind` equal to `"approval"`: a resume answers every interrupt,
and only approvals can be answered there. A row with one question among them offers none.

The detail must hold the assistant message with that `toolCalls` entry and **no** tool message
answering it. The recorded messages of the thread parked on `call-1`:

```json
[
  {
    "id": "u-r3",
    "role": "user",
    "content": "Please delete invoice 7"
  },
  {
    "id": "id-2",
    "role": "assistant",
    "toolCalls": [
      {
        "id": "call-1",
        "type": "function",
        "function": {
          "name": "delete_invoice",
          "arguments": "{\"target\":\"invoice-7\"}"
        }
      }
    ]
  }
]
```

### Restoring a pushed chart

`messages` may carry activity entries, `{"id", "role": "activity", "activityType", "content"}`,
and the component redraws each one it knows (a `chart` with
[`enableCharts`](server-pushed-ui.md#charts)). django-ag-ui does not store pushed activities in
the model history on purpose; it materialises them at their anchor when the server is given a
[`thread_activity_source`](https://artui.github.io/django-ag-ui/charts/#putting-a-pushed-chart-back-on-reload) (`AGUIServer(thread_activity_source=...)`,
the `ThreadActivitySource` protocol in django-ag-ui's persistence types). A chart anchored after the user message, as recorded:

```json
{
  "thread_id": "t-chart",
  "messages": [
    {
      "id": "u-r7",
      "role": "user",
      "content": "Chart it"
    },
    {
      "id": "chart-1",
      "role": "activity",
      "activityType": "chart",
      "content": {
        "kind": "bar",
        "series": [
          {
            "name": "Sales",
            "points": [
              1,
              2,
              3
            ]
          }
        ]
      }
    },
    {
      "id": "id-5",
      "role": "assistant",
      "content": "partial answer and the rest"
    }
  ]
}
```

## Rename and delete

`PATCH <url><id>/` with a JSON `{"title": "..."}`:

```json
{
  "status": 200,
  "etag": null,
  "body": {
    "thread_id": "t-chart",
    "title": "Sales"
  }
}
```

An empty or blank title is `400`, a missing thread `404`:

```json
{
  "status": 400,
  "etag": null,
  "body": {
    "error": "a non-empty 'title' is required"
  }
}
```

`DELETE` answers `204` with no body.

## Reading a thread

`POST <url><id>/read/` marks the thread read and answers `204`; an unknown thread answers `404`:

```json
{
  "status": 404,
  "etag": null,
  "body": {
    "error": "not found"
  }
}
```
