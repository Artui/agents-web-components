# The editors on a page of their own

`<ag-ui-routines>` and `<ag-ui-skills>` draw the same views the chat opens in its panel, as
elements of their own: an inline block that fills its container, for a settings page, a rail or
a dialog. Each works alone with only its URL, beside a chat, or under an
[`<ag-ui-agents>` provider](agents.md#several-agents-under-one-provider).

```html
<ag-ui-chat id="chat" endpoint="/agent/" data-routines-url="/agent/routines/"
  data-skill-editor-url="/agent/skills/editor/" data-editors="external"></ag-ui-chat>
<section class="settings">
  <ag-ui-routines for="chat"></ag-ui-routines>
  <ag-ui-skills for="chat"></ag-ui-skills>
</section>

<script type="module">
  import { defineChat } from "@artooi/agents-web-components/chat";
  import { defineRoutines } from "@artooi/agents-web-components/routines";
  import { defineSkills } from "@artooi/agents-web-components/skills";
  defineChat();
  defineRoutines();
  defineSkills();
</script>
```

Both elements share these rules:

- **Binding.** `for` names a chat's `id`, looked up in the element's own root; a chat added
  later is picked up when it first reports its thread. Or set the `chat` property, which wins
  over `for` until it is set back to `null`. With neither, the element binds to the chat of an
  `<ag-ui-agents>` provider: the one its `agents` attribute names by id, else the nearest one
  around it, and loads again when the agent it moves to lists a different URL. A chat or
  provider whose element is not defined yet is waited for, then bound. Until it binds, an
  element with its own URL loads it alone, through `fetch`, and loads it again through the chat
  or provider once bound. **`provider`**
  *(read-only)* is that provider. Bound to nothing, the element works alone.
- **URL.** Its own URL attribute wins; else the bound chat's same attribute; else, under a
  provider, the URL the agent on screen lists in the directory. With none, the element draws
  nothing. **`url`** *(read-only)* is the one in use, and **`reload()`** reads it again from
  the list.
- **Requests.** Bound to a chat, they go through `chat.request()`; under a provider, through
  `provider.request()`, which sends the provider's `headers` and `getHeaders()`; so the headers
  and cookie policy are the ones the page already set. Alone, they go through `fetch` with the
  `credentials` attribute (`omit`, `same-origin` by default, or `include`). Either way the
  element's own `data-csrf-token`, or else the cookie `data-csrf-cookie` names, read at each
  request, is sent as `data-csrf-header` (`X-CSRFToken` by default), winning per header.
  **`request(url, init?)`** is that `fetch`.
- **Opening from the chat.** With `data-editors="external"` on the chat, its Skills and Routines
  buttons, Make this a routine and the palette's Manage skills fire **`ag-ui-open-editor`**
  (`OPEN_EDITOR_EVENT`, detail `{ editor, fromConversation }`, where `editor` is `routines` or
  `skills`; bubbling, composed and cancelable) instead of opening the panel. A bound element
  answers it: it calls `preventDefault()`, takes focus on its heading and, for Make this a
  routine, opens the new routine's form. Scroll it into view or open the dialog it sits in from
  your own listener. Without an element to answer, nothing opens.
- **Focus.** The list has no back arrow; a form's arrow steps back to the list. A redraw moves
  focus only when focus was already inside the element.
- **Styling.** The full-panel view's parts (`panel-view`, `panel-view-bar`, `panel-view-title`,
  `panel-view-body`, `panel-view-footer`, `back-button`) and the view's own, as listed under
  [Theming](theming.md#theming-density-and-placement). The chat's colour, font and size tokens apply,
  plus `--ag-ui-danger`. The element takes the page's `color-scheme`, unless its `theme`
  attribute names `light`, `dark` or `auto`.
- **Strings.** `strings` translates the view's text, merged over the English, with the same
  keys as the chat's `strings` for that view, plus `back` (the arrow's label).

Neither element is in the main `/bundle`. Without a build step, load `/routines/bundle` or
`/skills/bundle`; each carries the element and its view, and none of the chat or the provider.

## The routines element

`<ag-ui-routines>` reads **`data-routines-url`** (django-ag-ui's `routines/`, from 0.86.0). The
list, Pause or Resume, Run now and the form are the chat's [routines](skills.md#routines) view.

- **Make this a routine** is at the foot of the list while the bound chat has a prompt on
  screen, and follows that conversation as it moves on. **`makeRoutine()`** opens the form the
  same way. Bound to nothing, it is absent.
- **The form's time and timezone** take a child of the element with `slot="routine-time"` or
  `slot="routine-timezone"`, and its `data-routine-minute-step`, as on the chat: see
  [The time and timezone fields](skills.md#the-time-and-timezone-fields).
- **A last result** fires **`ag-ui-routines-open-thread`** (`ROUTINES_OPEN_THREAD_EVENT`,
  detail `{ threadId }`, bubbling, composed and cancelable). Unless a listener prevents it, a
  chat bound by `for` or the property switches to that thread, and a provider opens it on the
  agent on screen. Alone, the event is all there is.
- **Strings** are `AgUiRoutinesStrings`, the chat's routines keys (`routines`, `newRoutine`,
  `makeRoutine`, `pause`, `resume`, `runNow` and the form's) plus `back`, "Back to the routines"
  by default.

## The skills element

`<ag-ui-skills>` reads **`data-skill-editor-url`** (django-ag-ui's `skills/editor/`, from
0.83.0). The list, Turn on and the form are the chat's [skill editor](skills.md#the-skill-editor).

- **Draft one with the agent** sends `/create-skill` to the bound chat. Bound to nothing, it is
  absent.
- **The palette follows.** After each write, the element calls the bound chat's
  `refreshSkills()`. When a run in that chat sends django-ag-ui's `ag_ui.skills_changed`
  CUSTOM event, the list reloads.
- **Strings** are `AgUiSkillsStrings`, the chat's skill editor keys (`skills`, `newSkill`,
  `noSkills`, `draftSkill`, `writeSkill`, `turnOn`, `turnOff` and the form's) plus `back`,
  "Back to the skills" by default.
