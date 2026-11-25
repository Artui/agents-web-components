# Skills and run notices

## Run notices: compaction and agent skills

Some things a run does are neither text nor a tool the user asked for — the server condensed
earlier turns to fit the context window, or the model pulled in an agent skill. Those render as
**run notices**: a muted one-line annotation inline in the transcript, styleable via the
`run-notice`, `run-notice-icon` and `run-notice-text` `part`s.

> **Two different things are called "skills".**
> The [prompt chips and slash palette](#skills-prompt-chips-and-slash-palette) below are a
> **human** affordance — prompts *the user* launches. An **agent skill** is a folder of
> instructions *the model* chooses to load mid-run. Only the second produces a run notice.

Neither notice needs configuration here — both appear when the server is set up to produce them.

**Compaction.** `django-ag-ui` emits a standard AG-UI `ACTIVITY_SNAPSHOT` with
`activityType: "compaction"` when a compaction capability trimmed the history; the notice reports
how many messages went. Server side, that means wrapping the capability in `CompactionObserver` —
see [django-ag-ui's compaction guide](https://artui.github.io/django-ag-ui/compaction/). Activity
events of any other type pass through untouched, so another producer on that channel is not
mistaken for a compaction.

**Agent skills.** There is no dedicated event for these: loading a deferred capability *is* an
ordinary `load_capability` tool call, which is what reaches the client. The component recognises
it, renders `Using skill <id>`, and suppresses the raw tool card that would otherwise appear
beside it — on the live stream and on restored history alike, so a reload shows the same
transcript. A `load_capability` call with no usable id falls back to a normal tool card rather
than being dropped, since it is still real activity.

Both strings are overridable like every other — `historyCompacted` (token `{count}`) and
`usingSkill` (token `{name}`).

## Skills: prompt chips and slash palette

Skills are pre-defined prompts the user can launch from a chip or the `/`-command palette. They are
opt-in via two attributes:

```html
<ag-ui-chat endpoint="/agent/" data-prompt-chips="true" data-slash-commands="true"></ag-ui-chat>
```

A `Skill` is `{ name, title, description?, prompt?, sendImmediately?, chip? }`. Skills are merged
from three sources — **backend → embed → client** (later wins by `name`):

- `data-skills-url` — a JSON endpoint, fetched with the element's `headers`.
- `data-skills` — an inline JSON catalog.
- `setSkills(skills)` — set the client catalog from JS.

```js
chat.setSkills([
  // Server-resolved: no prompt here, so picking it sends the bare "/triage"
  // token and the agent decides what it means.
  { name: "triage", title: "Triage this", chip: true },
  // Client-side: the page owns the wording and fills the placeholders.
  { name: "summarize", title: "Summarize page", prompt: "Summarize {title}.", chip: true },
]);
```

**Prefer omitting `prompt` for anything internal.** A skill is often where a project's workflow is
written down most plainly, and a catalog is either a plain `GET` or sits in the page source — so
shipping the wording to the browser publishes it. Without a `prompt` the component sends `/name`
and the agent expands it (from the harness `Skills` capability, or your own instructions); the text
never leaves the server. `django-ag-ui`'s `SkillRegistry` supports this by leaving `prompt` unset.

A skill that *does* carry a `prompt` may use `{placeholder}` tokens; the `skillContext` property
(`() => Record<string, unknown>`) supplies the values, filled in before send. A missing placeholder
blocks the send and shows a hint instead.

```js
chat.skillContext = () => ({ title: document.title });
```

**Picking a skill sends it.** A chip that needs a second click to do anything is a two-step
shortcut. Set `sendImmediately: false` on a prompt-carrying skill to pre-fill the composer instead —
useful when the user is expected to edit before sending. A server-resolved skill always sends.

### The skill editor

With django-ag-ui's stored skills (`AGUIServer(skill_editor=True)`, 0.83.0 or later), the element
can offer an editor for the skills the caller may write. Point `data-skill-editor-url` at the
mount's `skills/editor/` route:

```html
<ag-ui-chat
  endpoint="/agent/"
  data-skills-url="/agent/skills/"
  data-skill-editor-url="/agent/skills/editor/"
  data-skill-editor-button
  data-slash-commands="true"
></ag-ui-chat>
```

The editor opens in place of the conversation, below the header, from a "Manage skills" row at the foot of the
`/` palette (under `data-slash-commands`; alone under a bare `/` when nothing matches) and, with `data-skill-editor-button`, from a Skills button in the header (`openSkillEditor()` and
`closeSkillEditor()` drive it from your own chrome). It lists the skills the server says the caller
may write, off ones included, with "Turn on" on an off row; it creates, edits and turns skills off;
and "Draft one with the agent" closes it and sends `/create-skill`, whose draft comes back as an
approval card. History, Checkpoints and New chat close it first. The server keeps every rule: a
refused save shows the server's message (`{"error"}`) under the field its `"field"` names (django-ag-ui
0.84.0 and later name the field: `name`, `description`, `body`, `userInvocable`, `modelInvocable` or
`enabled`), and above the form when it names none.

#### Whose skill it is

With django-ag-ui 0.91.0 and a skill policy that defines `scope(request, skill)`, each editor entry
carries `scope`, and the row draws a badge after the skill's name: **Personal** for `"personal"`,
**Company** for `"shared"`. An entry without `scope` (an older server, or a policy without the
method) draws no badge, as before. The badge is the part `skill-scope`, with the value in
`data-scope`, so a host can style each scope:

```css
ag-ui-chat::part(skill-scope) { color: var(--ag-ui-muted); }
```

The words are strings keyed `skillScope:<value>`. Override the two the component knows, or name a
label for a scope your own policy returns; a scope with no label draws no badge, since its raw value
may be an internal name rather than words for a user. The same keys work on `<ag-ui-skills>`'s
`strings`:

```js
chat.strings = {
  "skillScope:shared": "Acme",
  "skillScope:team": "Team",
};
```

**Writes are CSRF-checked by default** on the server, and each one sends `headers` and
`getHeaders()` as read at that moment, so a `getHeaders` returning the current CSRF token is all a
Django host needs:

```js
chat.getHeaders = () => ({ "X-CSRFToken": readCookie("csrftoken") });
```

The palette catches up without a reload: after each save from the editor, on every change of
`user-key`, and whenever a run sends django-ag-ui's `ag_ui.skills_changed` CUSTOM event (still
forwarded to the page as `ag-ui-custom`). A `user-key` handover also closes the editor and drops
what it held, the previous principal's skill bodies included.

### Routines

django-ag-ui (0.86.0 on, with `routine_model=`) serves a caller's routines: prompts the agent
runs on a schedule. Point `data-routines-url` at that mount's `routines/` route and the header
gains a Routines button that opens them in the full-panel view:

```html
<ag-ui-chat endpoint="/agent/" data-routines-url="/agent/routines/" data-threads-url="/agent/threads/"></ag-ui-chat>
```

Each row says its schedule in words (in the routine's own timezone, named when it is not the
viewer's), its next run (or why it is paused) and its last result, which opens that run's thread.
Pause or Resume and Run now act on the row. The view's bar adds a routine, and a row opens its
form: name, prompt, a weekly or every-few-hours schedule, the timezone, and the tools each run
may use without asking, offered from the server's `grantable` list. A destructive tool is marked,
and granting it asks first, naming it destructive; the grant is then sent in `confirmDestructive`
on every save, as the server requires. Make this a routine, at the foot of the list, in the
header's More menu once a prompt is on screen, and as `makeRoutine()`, opens the form with the conversation's own prompts as the routine's.

Writes are JSON and carry `getHeaders()`, so a CSRF header reaches them as it reaches the skill
editor. With `data-threads-url` on the same mount, a thread a routine started carries a badge with
the routine's name in the thread list. `openRoutines()` and `closeRoutines()` open and close the
view; a principal change closes it.

The skill editor and routines can also stand on the page as elements of their own; see
[The editors on a page of their own](editors.md#the-editors-on-a-page-of-their-own).

#### The time and timezone fields

The form's time is two selects, the hour (00 to 23) and the minute in steps of five, drawn by the
panel's tokens rather than the browser's time popup, and announced as one group named by the At
caption. `data-routine-minute-step` changes the step; a routine whose minute is off the step keeps
its exact minute as an option of its own, never rounded. The timezone is a text input suggesting
the browser's IANA zones (`Intl.supportedValuesOf("timeZone")`), set to the viewer's zone on a
new routine; an unknown zone is refused by the server, in its words.

Either field can be replaced by a control of your own, slotted on the element:

```html
<ag-ui-chat endpoint="/agent/" data-routines-url="/agent/routines/">
  <select slot="routine-time" aria-label="Run at">
    <option>07:00</option><option>08:00</option><option>18:00</option>
  </select>
  <select slot="routine-timezone" aria-label="Timezone">
    <option>UTC</option><option>Europe/Paris</option>
  </select>
</ag-ui-chat>
```

| Slot | Value |
| --- | --- |
| `routine-time` | `HH:MM`, 24-hour, as the wire carries it |
| `routine-timezone` | An IANA zone name |

The contract is a value, not a type: any element with a string `value` property. When the form
opens a routine it sets the control's `value` to the routine's (once per opening, so a re-render
of your control does not overwrite a choice in progress), and on save it reads `value`. Nothing
listens for `change`.
A `<select>` that has no option for the routine's value shows nothing chosen, so offer every value
your routines can hold. The form's caption cannot name a slotted control across the shadow
boundary: give yours its own `aria-label`. The slotted controls are yours to style; the
built-in fields stay in the form as the slots' fallback content.
