# Moving from `@artooi/ag-ui-web-component`

The old package is replaced, not upgraded: the tags, events, parts, slots and `--ag-ui-*` custom
properties keep their names, so markup and stylesheets carry over untouched. What changes is the
package, how the element is defined, and a handful of removals.

**Install the new package and remove the old one.** Never keep both on a page: each defines the
`<ag-ui-chat>` tag, and the second to load cannot claim it.

```bash
npm uninstall @artooi/ag-ui-web-component
npm install @artooi/agents-web-components
```

A vendored bundle is renamed too: `dist/agents-web-components.bundle.js` replaces
`dist/ag-ui-web-component.bundle.js`.

**Define the element.** `defineAgUiChat` is now `defineChat`, and it lives on the `./chat` entry.
Importing the package still registers nothing, so the call stays explicit:

```js
// before
import { defineAgUiChat } from "@artooi/ag-ui-web-component";
defineAgUiChat();

// after
import { defineChat } from "@artooi/agents-web-components/chat";
defineChat();
```

The bundle exports it too (`import { defineChat } from "@artooi/agents-web-components/bundle"`).
`defineChat()` does nothing when `AgUiChat` already holds the tag, and throws, naming the tag,
when another class holds it, which is how a second copy of the element shows itself.

**The first deploy forgets what the browser stored.** Every storage key now starts with
`agents-web-components` instead of `ag-ui-chat`, and nothing migrates the old keys. The first page
load after the move starts from the defaults: the open thread, the collapsed state, the panel
size, the launcher and dock position and the theme are gone once, and so is the drawer's list of
threads, unless `data-threads-url` is set, in which case the server still supplies it.
A host that reads the old keys itself must read the new root.

**Removed names.** Each is gone; most have a replacement that behaves the same:

| Removed | Use instead |
| --- | --- |
| `defineAgUiChat` | `defineChat`, from `./chat` |
| `createStateHookTools`, `StateHook` | `createPageStateTools`, `PageState` |
| the element's `registerStateHook` method | `registerPageState` |
| `AgUiClient.annotatedMessages` | `AgUiClient.messages` |
| the `noResult` string in `UiStrings` | nothing: `callNotFinished` answers a call that never returned |

A string table that still sets `noResult` stops type-checking; delete the entry.

**Server-side rendering.** The element extends `HTMLElement` and some helpers read the DOM, so
evaluating the package in Node throws. Import it on the client only: from a client-side module, a
dynamic `import()` behind a browser check, or your framework's client-only boundary. The package
declares `sideEffects: false`, so an unused import is dropped, but that is a bundling property,
not a promise that the modules load without a DOM.
