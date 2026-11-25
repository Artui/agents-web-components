# Theming, density, and placement

The chat shell is styled inside its Shadow DOM and exposes a large set of `--ag-ui-*` CSS custom
properties (colors, status, surface, spacing, layout), so you theme it from outside without
piercing the shadow boundary. Set them anywhere above the element and they inherit in — on the
element itself, on a wrapper, or on `:root` for a whole page. The closest declaration wins, the
way any inherited CSS property behaves:

```css
/* All three work. The most specific one that applies wins. */
:root      { --ag-ui-accent: #4f46e5; }  /* whole page */
.chat-dock { --ag-ui-accent: #0f766e; }  /* one region */
ag-ui-chat { --ag-ui-accent: #b91c1c; }  /* one widget */
```

> Until 0.20.x the defaults were declared on `:host`, which set them *on the element* — and an
> element's own value beats anything inherited from an ancestor, so only the `ag-ui-chat { … }`
> form did anything and the wrapper form silently did nothing. The defaults now sit behind an
> internal alias, so all three forms work.

A few of the knobs, at Quiet's light values:

```css
ag-ui-chat {
  --ag-ui-accent: #232326;        /* #f0f0f2 in the dark scheme */
  --ag-ui-bg: #ffffff;            /* #161618 */
  --ag-ui-fg: #1b1b1d;            /* #ececee */
  --ag-ui-radius: 12px;
  --ag-ui-header-btn-size: 30px;  /* the header's controls; 44px on touch */
  --ag-ui-header-gap: 4px;

  /* What is drawn on top of the accent and danger fills. Unset, the one on
     the accent is white or black by the accent's luminance (see Text on the
     accent below); set it to pin a colour of your own. */
  --ag-ui-on-accent: #ffffff;
  --ag-ui-on-danger: #ffffff;

  /* Layout */
  --ag-ui-width: 380px;
  --ag-ui-height: 560px;
  --ag-ui-inset: auto 24px 24px auto;
  --ag-ui-shadow: 0 1px 2px rgb(0 0 0 / 0.05), 0 12px 32px -16px rgb(0 0 0 / 0.22);
}
```

`--ag-ui-radius` is the theme's corner radius. It rounds the panel's frame and the corners inside
the panel that have no radius of their own: the answer well, the conversation list's *New chat*
button and filter field, and the *Undo* on a run notice. The frame is the exception where it meets
the edge of the window. `page` and `sidebar` draw it square, and so does every placement but
`embedded` on a small viewport, while the corners inside keep the theme's radius, since none of them
meets that edge. `--ag-ui-panel-radius` sets the frame on its own, in any placement. Each theme
gives the floating frame a radius of its own (`--ag-ui-frame-radius`: 14px in Quiet against 12px
inside), and a host's `--ag-ui-radius` still sets both.

## Themes

`theme` is up to two words, in any order, matched as words (`~=`):

```
theme = [name] [scheme]
name   = quiet | soft | ledger | classic | <a word of your own>
scheme = light | dark | auto            default: light
```

| Value | Result |
| --- | --- |
| *(absent)* | Quiet, light |
| `dark` | Quiet, dark |
| `auto` | Quiet, following the system's `prefers-color-scheme` |
| `soft`, `soft dark`, `ledger auto` | that theme in that scheme |
| `classic`, `classic dark` | the look from before themes, for a host that pins it |
| `acme` | a word the component does not ship adds no rules, so this is Quiet, ready for your `[theme~="acme"]` CSS |
| `soft acme` | starts from Soft; your `[theme~="acme"]` rules layer on top |

The built-in themes:

| Theme | Look |
| --- | --- |
| `quiet` | The default. Neutral graphite on white, no bubble for the agent's turn, hairlines, status as an icon. Set one brand accent and the user's turn, the send button and the links follow it. |
| `soft` | Rounded and tinted: surfaces mixed from the accent, pill chips, a deep frame shadow. Violet by default. |
| `ledger` | Dense and editorial: paper and ink, square corners, serif for what the agent says and monospace for the chrome. |
| `classic` | The look before themes: the indigo header, the accent user bubble, the status pill and the round launcher. Pin it to keep that look. |

**The default scheme is `light`, not `auto`**, because the widget sits on your page and only you
know that page's scheme. A light admin screen on a machine in dark mode would otherwise get a dark
panel on a white page. If your page follows the system, say `auto`.

Each theme is three seeds, `--ag-ui-bg`, `--ag-ui-fg` and `--ag-ui-accent`, each declared with
`light-dark()` so the scheme word picks the half. Every other colour is mixed from them with
`color-mix(in oklch, ...)` -- hover, borders, the secondary text inks, washes, the user's turn (the
accent at 12% over the background) -- and every derived value still reads its own public token
first, so each stays an override point. The tokens the themes add:

- **Inks and lines:** `--ag-ui-ink-2`, `--ag-ui-ink-3`, `--ag-ui-line`, `--ag-ui-line-strong`.
- **Surfaces:** `--ag-ui-wash`, `--ag-ui-accent-ink`, `--ag-ui-tint`, `--ag-ui-tint-2`.
- **Type:** `--ag-ui-text-xs`, `--ag-ui-text-sm`, `--ag-ui-text-md`, `--ag-ui-text-lg`,
  `--ag-ui-leading`, `--ag-ui-serif`.
- **Frame:** `--ag-ui-frame-radius`, `--ag-ui-frame-shadow`. These are what a theme sets for the
  frame; `--ag-ui-panel-radius` and `--ag-ui-shadow` stay the final say, and are what a docked
  placement squares or flattens.
- **Charts:** `--ag-ui-chart-1` to `--ag-ui-chart-6`. A host's value beats the theme's.
- **Status marks:** `--ag-ui-ico-check`, `--ag-ui-ico-error`, `--ag-ui-ico-declined`, mask images
  drawn in the state's colour, and `--ag-ui-ico-chevron`, the step group's disclosure chevron.
- **Focus:** `--ag-ui-ring`, the step group head's focus outline. Unset, it is two parts accent
  to three parts ink (`--ag-ui-fg`), which holds 3:1 against the panel for any accent.

The font is part of the theme: Quiet, Soft and Ledger set their own stack (Inter, then the system
UI font), and Classic inherits the page's font as the component always did. To take the page's font
under any theme, set `--ag-ui-font` to the page's family, or to the page's own font token:

```css
ag-ui-chat { --ag-ui-font: var(--body-font); }   /* or the family itself */
```

`--ag-ui-font: inherit` does not do this. A CSS-wide keyword in a custom property applies to the
custom property itself, so it takes the `--ag-ui-font` of the parent, which nothing sets, and the
theme's stack wins.

### Text on the accent

`--ag-ui-on-accent`, unless you set it, is picked from the accent's own luminance: white on an
accent darker than WCAG relative luminance 0.179, black on a lighter one, which is the better of
the two on every colour (never under 4.58:1). It is computed with relative colour syntax with
channel arithmetic, behind `@supports` for that exact expression: Chrome 119, Firefox 128, Safari
18.

**The fallback.** Two browsers at or above the floor cannot compute it: Firefox 120 to 127, which
lack relative colour syntax, and Safari 17.5 and 17.6, which shipped an earlier draft that rejects
this expression. They keep a fixed colour per theme instead:

| Theme | Without relative colour syntax |
| --- | --- |
| `quiet`, `soft`, `ledger` | the scheme's: white in the light scheme, near-black (`#111111`) in the dark one |
| `classic`, `code` | white in both schemes, the colour they always drew |

On every built-in accent but code's the fixed colour is on the same side as the computed one, so
those browsers see the same contrast. On code's green the computed pick is black (8.3:1) and the
fallback white (2.5:1), as it always was. What they miss is the correction for a host's accent: a
mid-tone brand accent can fall under 4.5:1 there, under any theme. If you support those browsers
and set a mid-tone accent, set `--ag-ui-on-accent` yourself. There is no script path.

### Keeping a brand accent on the header

Quiet draws the header, the launcher and the tool names in the panel's own colours, so a host that
sets only `--ag-ui-accent` gets a neutral header. To put the accent back without leaving Quiet, set
the surfaces to the accent and the text on them to a colour that reads on it. The same recipe holds
under every other theme:

```css
ag-ui-chat {
  --ag-ui-header-bg: #3d5afe;
  --ag-ui-header-fg: #ffffff;
  --ag-ui-launcher-bg: #3d5afe;
  --ag-ui-launcher-fg: #ffffff;
  --ag-ui-tool-fg: #3d5afe;
}
```

- **The header buttons follow `--ag-ui-header-fg`, under every theme.** Unset, each theme draws
  them its own way at 0.85 opacity: Quiet, Soft and Ledger in their third ink, Classic and Code in
  the header text, each on its own hover square. Once you set the header text they draw in it at
  full opacity, and the hover square is the opposite of that text at about a fifth (a darker square
  under white text, a lighter one under dark text), so a hovered button reads at least what your
  header pair reads. A theme word of your own starts from Quiet, so it holds there too. No
  `::part(header-button)` rule is needed. The opposite is computed with relative
  colour syntax; the browsers without it (see the fallback above) mix the square from the text
  itself, which on a mid-tone header can take the hovered glyph under your pair (white on
  `#3d5afe`: 3.75:1).
- **`--ag-ui-header-btn-hover` sets the hover square outright** under every theme, whether or not
  the header text is set, and is drawn exactly as given. For a square that lightens under white
  text instead, at the cost of contrast on a mid-tone header:

  ```css
  ag-ui-chat { --ag-ui-header-btn-hover: color-mix(in srgb, #ffffff 18%, transparent); }
  ```
- **`--ag-ui-tool-fg` colours every tool call**, in a step group as well as in the card displays.
  Unset, a grouped call is drawn in the second ink (`--ag-ui-ink-2`) under every theme.
- Pick the pair yourself: `--ag-ui-header-fg` is not derived from the header colour the way
  `--ag-ui-on-accent` is from the accent.

### Overriding a theme, lightest layer first

Four layers, each documented and each lighter than the next. Reach for the first one that does
the job.

#### (a) Tokens

Any `--ag-ui-*` token, on the element or any ancestor, as above. Per theme, from your own CSS:

```css
body { --ag-ui-accent: #0f766e; }          /* accent only: the rest follows */
ag-ui-chat[theme~="soft"] { --ag-ui-accent: #c2410c; --ag-ui-frame-radius: 12px; }
```

A page rule always beats the theme's own value, because the theme only ever sets the private
alias behind the public token.

#### (b) Parts

`::part()` reaches the structural elements, as listed in [Parts and slots](#parts-and-slots):

```css
ag-ui-chat::part(header) { background: linear-gradient(#f2f7f6, transparent); }
```

#### (c) A theme of your own

Name it, and style the name. An unknown word adds no built-in rules, so it starts from Quiet (or
from the built-in theme beside it):

```html
<ag-ui-chat theme="acme dark"></ag-ui-chat>
```

```css
ag-ui-chat[theme~="acme"] {
  --ag-ui-bg: light-dark(#fbfaf7, #10161c);
  --ag-ui-fg: light-dark(#14212b, #e4ebf0);
  --ag-ui-accent: light-dark(#0b5cad, #6cb2ff);
  --ag-ui-frame-radius: 4px;
}
```

Use `light-dark()` in the seeds and the scheme word, and the theme toggle, work for your theme
too.

#### (d) `extraStyles`: the last mile

> **Unstable.** `extraStyles` reaches the class names inside the shadow root, and those are not a
> public API: they may change in any minor release. Layers (a) to (c) are the supported ones; use
> this for what they cannot reach, and expect to revisit it on upgrade.

```ts
const sheet = new CSSStyleSheet();
sheet.replaceSync(`.message--assistant { padding: 10px 12px; border-radius: 10px; }`);
chat.extraStyles = [sheet];
```

- `extraStyles: readonly CSSStyleSheet[]`, per element, default `[]`. Two elements can carry
  different sheets.
- Adopted after the built-in sheet, so a rule of equal specificity wins.
- Setting it re-adopts at once. The array is copied, so changing the one you passed does nothing
  until you set it again; changing a sheet's rules does apply, since the sheet itself is shared.
- Constructed sheets are not subject to `style-src`, so this works under the same strict CSP as
  the built-in sheet. There is no string form and no `<style>` injection.

## Small viewports

At **600px wide and below** every placement but `embedded` becomes one full-bleed
shape: edge to edge, no radius, no shadow, no resize grips. A phone is not an
eighth placement — it is an override that collapses the others onto one of them.
The host picked a placement for the desktop it was designing, and a 380x560
panel with a 24px margin is not a smaller version of that decision, it is most
of the screen with a frame drawn round it.

`embedded` is left alone deliberately: it sits in a box you sized and placed, and
only you know whether that column should become the whole screen.

The [greeting layout](#the-greeting-on-an-empty-page) changes shape here too, and
it is the one part of this that `embedded` gets as well, because it moves nothing
about the box you placed: an empty conversation keeps its composer at the foot of
the panel, with the starters against it and the greeting over the space above
them, instead of centring all three together.

The corner placements still rest at their launcher, so a full-bleed panel is
something the user opens rather than something they are given.

**To keep your desktop layout at every width**, set `data-small-viewport="off"`.
That exists because the *trigger* is the one part of this you cannot reach: every
value the override sets is a `--ag-ui-*` token you can re-state, but a media
query cannot read a custom property, so the breakpoint itself is a literal.

**A size or inset token set at every width restates the phone shape too.** The phone
block reads `--ag-ui-inset`, `--ag-ui-width`, `--ag-ui-height` and `--ag-ui-max-height`
before it falls back to the full-bleed values, so a host rule such as the one below keeps
its 420x640 panel with a 24px margin on a phone, and the panel runs off the screen's left
edge. Put the desktop sizes above the breakpoint and the phone shape needs nothing:

```css
/* Wrong on a phone: the tokens apply at every width. */
ag-ui-chat {
  --ag-ui-inset: auto 24px 24px auto;
  --ag-ui-width: 420px;
  --ag-ui-height: 640px;
  --ag-ui-max-height: 80vh;
}

/* Right: desktop only. At 600px and below the panel is full-bleed with no reset. */
@media (min-width: 601px) {
  ag-ui-chat {
    --ag-ui-inset: auto 24px 24px auto;
    --ag-ui-width: 420px;
    --ag-ui-height: 640px;
    --ag-ui-max-height: 80vh;
  }
}
```

Setting the tokens at every width stays right for a host that wants a non-full-bleed phone
panel, a bottom sheet for example. The size a user dragged is a separate matter; see
[Sizes, keyboard, and parts](header-and-panel.md#sizes-keyboard-and-parts) for its precedence.

The breakpoint is a width rather than a pointer test, and that is on purpose: a
touch laptop is coarse-pointered and wide, a narrow desktop window is
fine-pointered and small. Width decides the layout; the pointer decides which
controls make sense.

## The conversation list

The chat-history list slides over the transcript at every width and under every
placement, a full page included. Opening it moves nothing underneath: the
conversation, the centred greeting and the composer are exactly where they were.
While it is open it is a modal dialog: focus moves into it, Tab stays inside it,
and Escape, its close control or a click on the backdrop beside it closes it and
returns focus to where it was. `openThreads()` and `closeThreads()` do the same
from your own chrome.

The list also grows a filter once there are eight or more conversations in it
— above that a search box is worth having, below it it is a control asking to be
used on a list you can already read in one glance. It matches the title **and**
the preview, because the title is often the model's one-line summary and the
phrase you remember is as likely to be inside the conversation as on it, and it
filters what the drawer already holds rather than going back to the server for a
list that is already in memory. `data-threads-search="always"` shows it over any
list and `"never"` hides it, for a host whose lists are always short or always long.

The rows are grouped by when they were last active: **Today**, **Previous 7 days**
and **Older**, counted from local midnight. A group with no rows is not drawn,
and a list that falls in one group draws no heading at all. A conversation with no
readable date goes under Older. A filtered list keeps its groups. The headings
are not in the Tab order, are styled as `::part(drawer-group-label)`, and take
their text from the `threadsToday`, `threadsPreviousWeek` and `threadsOlder`
strings. Every drawer has them: the slide-over, the bar's popover and the popover
beside your own button.

## Reserving the space your own chrome occupies

A fixed placement covers the viewport it is given, and it does not know about
your sticky header. Tell it which edges are already spent and every placement
does its own arithmetic:

```css
ag-ui-chat {
  --ag-ui-viewport-inset-top: 64px;    /* your nav bar */
}
```

`page` and `full` inset by all four edges; `sidebar` and `side` by three, leaving
the docked edge free; `floating` adds them to its own margins.
**The heights follow on their own** — that is the point of these rather than
restating `--ag-ui-inset` per placement, which leaves you to keep
`--ag-ui-height` and `--ag-ui-max-height` in step by hand and overflows the panel
off the bottom of the screen the one time you forget.

Four longhands rather than one shorthand because a custom property is a token
stream and CSS cannot index one; the height arithmetic needs the vertical pair on
its own. Any CSS length works — `px`, `rem`, `env(safe-area-inset-*)`, or a
`calc()` combining them; the widget reads the resolved value rather than the text
you wrote, so the number it clamps against is the one the stylesheet uses:

```css
ag-ui-chat {
  --ag-ui-viewport-inset-top: env(safe-area-inset-top);
  --ag-ui-viewport-inset-bottom: env(safe-area-inset-bottom);
}
```

If your chrome changes height — a bar that wraps at narrow widths — measure it
and publish the value, since no CSS length tracks it:

```js
new ResizeObserver(() => {
  document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`);
}).observe(bar);
```

```css
ag-ui-chat { --ag-ui-viewport-inset-top: var(--bar-h, 0px); }
```

`--ag-ui-edge-gutter` (default `24px`) is the gap a resting `floating` panel
keeps between itself and that box. The size cap subtracts the same one, so a
panel grown to its limit reaches the far edge of the usable box and no further —
set it to `0` for a panel flush against the corner.

`--ag-ui-anchor-gap` (default `8px`) is the gap between the panel and the button
it rises from under `collapse-to="none"`; see [Collapsing to a bottom
bar](header-and-panel.md#collapsing-to-a-bottom-bar).

`--ag-ui-keyboard-inset` overrides the lift an on-screen keyboard earns. The
widget measures the hidden band and publishes it as
`--ag-ui-visual-viewport-inset-bottom`; state this one instead to outrank that
measurement, or set it to `0px` to opt out of the lift entirely.

`--ag-ui-keyboard-inset-top` does the same at the top. To show a field a
keyboard would cover, a mobile browser pans the visible area down the page, and
a panel anchored to the screen (`page`, `full`, `side`, `sidebar`, and at phone
width the corner placements too) moves down with it. An `embedded` panel renders
in your own box rather than against the screen, so it does not move at any width.
The widget publishes the pan as `--ag-ui-visual-viewport-inset-top`, and the
panel moves by as much of it as goes past your `--ag-ui-viewport-inset-top`,
since the pan scrolls a reserved bar away with the page. State
`--ag-ui-keyboard-inset-top` to outrank that distance, or `0px` to keep the
panel below your reserved top.

`--ag-ui-viewport-height` and `--ag-ui-viewport-width` state the usable box
outright, for the case where no viewport-percentage length describes it. An
on-screen keyboard is the one that matters: it changes neither `vh` nor `dvh` nor
`svh` on any current mobile browser, so a full-bleed panel has to be told the
visual viewport's height rather than deriving it. The widget does that itself;
where it has nothing to report, the panel falls back to `100dvh` rather than
`100vh`, because iOS Safari resolves `vh` to the screen with its bars collapsed
and a panel sized from it runs under them.

Marks are variables too, so one vocabulary covers a re-theme rather than
leaving half the transcript in the built-in set: `--ag-ui-tool-icon-done` /
`-error` / `-declined` for tool status, and `--ag-ui-disclosure-collapsed` /
`--ag-ui-disclosure-expanded` for every expandable row.

```css
ag-ui-chat {
  --ag-ui-disclosure-collapsed: "+";
  --ag-ui-disclosure-expanded: "-";
}
```

## Where to put the variables

There is one vocabulary — the `--ag-ui-*` names above — and it works from any ancestor. What
differs is only *which* declaration wins, and that is ordinary CSS inheritance:

```css
/* A whole page or design-system scope. */
:root { --ag-ui-accent: var(--brand-600); --ag-ui-radius: 4px; }

/* One region — the widget picks this up through the wrapper. */
aside.support-dock { --ag-ui-accent: #0f766e; }

/* One widget. Beats both of the above, because it targets the element. */
ag-ui-chat#support { --ag-ui-accent: #b91c1c; }

/* Set at runtime with el.style.setProperty(...) — an inline style beats all of the above. */
```

Two that do not work:

```css
/* ::part() reaches structural elements, not variables — a custom property set
   here applies to that part's own subtree, not to the whole shell. */
ag-ui-chat::part(panel) { --ag-ui-accent: #b91c1c; }

/* The internal --_* aliases are private and unversioned; they are renamed
   without notice. Always set the public --ag-ui-* name. */
ag-ui-chat { --_accent: #b91c1c; }
```

The preset attributes below sit *underneath* anything you declare: a `theme="dark"` widget still
honours an explicit `--ag-ui-bg` from your CSS, so you can adopt a preset and correct one token
rather than re-declaring the whole palette.

`--ag-ui-accent` reaches further than the widget: it also colours the rings the DOM driver draws
on **your** page. Each primitive reads it from the computed style of the element it is about to
touch, so setting it on `:root` (or on any ancestor of the elements the agent drives) themes the
highlights too. Without it they fall back to the package indigo.

For the common cases there are three CSS-reactive **preset attributes** (no JS API), so you don't
have to hand-tune the variables:

- `theme` — a theme name and a scheme; see [Themes](#themes).
- `density` — `comfortable` (default) / `compact`.
- `placement` — `floating` (default) / `sidebar` / `page` / `embedded`. `embedded` drops the
  fixed positioning and z-index so the widget sits in normal document flow; `page` is a
  full-screen [centred reading column](#page-placement) for a route of its own.

  Four, because those are the four shapes that differ structurally: a corner panel, a docked
  rail, a surface that owns the screen, and a thing in your layout. Three older values --
  `bottom-left`, `side` and `full` -- still parse and still work, and are no longer documented:
  each is a variant of one of the four rather than a shape of its own. `full` is `page` with
  `--ag-ui-content-max-width: none`, `bottom-left` is `floating` with a different
  `--ag-ui-inset`, and `side` is `sidebar` that collapses to the floating launcher instead of
  an edge rail. Nothing warns and nothing breaks; there is simply less to choose between.

**`embedded` fills the box your page gives it, so give it one.** It is the placement app-shell
layouts reach for, and a grid or flex item defaults to `min-height: auto` — which lets a growing
transcript push the composer off the bottom of the window instead of scrolling inside the panel. The
fix belongs to the containing element, not to the widget:

```css
.assistant-pane { min-height: 0; overflow: hidden; }   /* the box the element is given */
```

```html
<ag-ui-chat endpoint="/agent/" theme="dark" density="compact" placement="sidebar"></ag-ui-chat>
```

See [`src/ui/shell/token_styles.ts`](https://github.com/Artui/agents-web-components/blob/main/src/ui/shell/token_styles.ts) for the full variable list and
[`src/ui/placement/`](https://github.com/Artui/agents-web-components/tree/main/src/ui/placement/) for the placement presets. The
[`demo/`](https://github.com/Artui/agents-web-components/tree/main/demo/) (`make demo`) has a scenario for each: placements, themes and tokens, answers and
reasoning, tool display, and the rest, each switched live on its own page.

The demo server binds every interface and prints the addresses this machine can be reached on, so you can open the demo on a phone — which is the only way to see the small-viewport layout with a real on-screen keyboard rather than a resized desktop window. `HOST=127.0.0.1` keeps it to this machine.

## Parts and slots

For styling beyond the `--ag-ui-*` variables, every structural element exposes a `part` so you can
reach it from outside the Shadow DOM with `::part()` — no shadow piercing. The part names are
**public API** (additions are non-breaking; renames are breaking):

```css
ag-ui-chat::part(panel)   { border-radius: 0; }
ag-ui-chat::part(header)  { background: #111; }
ag-ui-chat::part(send)    { text-transform: uppercase; }
ag-ui-chat::part(tool-card) { font-family: var(--my-mono); }
```

Every part, by the feature it belongs to. Spelled out rather than abbreviated: the list used to
read `tool-card` *plus* `-icon` / `-name`, which is compact and is also how an entire feature went
missing from it for two releases. A test reads this table and compares it with the parts the
component sets, so a new one cannot ship undocumented.

| Feature | Parts |
| --- | --- |
| Shell | `panel`, `header`, `title`, `icon`, `header-controls`, `messages`, `empty`, `greeting`, `pending`, `stopped`, `usage-line`, `jump-latest`, and one per resize grip: `resize-handle` plus `resize-handle-top`, `resize-handle-bottom`, `resize-handle-left`, `resize-handle-right`, `resize-handle-top-left`, `resize-handle-top-right`, `resize-handle-bottom-left`, `resize-handle-bottom-right` |
| Header buttons | `header-button` on each, plus `skills-button` (with `data-skill-editor-button`), `routines-button` (with `data-routines-url`), `history-button`, `checkpoints-button`, `new-button`, `maximize-button`, `collapse-button`, `theme-toggle`, `more-button` (only while the row has moved a control into its menu, or the menu holds Make this a routine), `make-routine-button` (in the menu, with `data-routines-url` and a prompt on screen); `header-menu` on the [More menu](header-and-panel.md#the-header-row-and-its-more-menu) |
| Collapsed widget | `launcher`, `launcher-icon`, `launcher-badge`, `rail-label`, `bar` (the [bottom bar](header-and-panel.md#collapsing-to-a-bottom-bar)'s wrapper, around the launcher), `bar-place` (the place beside the bar's title; its text carries `place-label` and `place-detail`), `bar-history` |
| Answers | `answer` (the per-turn group), `message` (plus `message-user`, `message-assistant`), `code-copy`, `enqueued-messages` and `enqueued-messages-note` (user messages a run took in mid-turn), `citations` (the collapsed sources list under an answer that cites them), `answered-by-model` (the line naming the model a fallback answer came from) |
| Reasoning | `thoughts`, `thoughts-toggle`, `thoughts-body`, `thoughts-label` |
| Follow-up suggestions | `suggestions`, `suggestion-chip` |
| Message actions | `run-error-offer` (the new-conversation offer under a failed run), `message-actions`, `message-action` (plus `message-action-retry`, `message-action-copy`, `message-action-up`, `message-action-down`), and the icon holder inside each: `message-action-icon` (plus `message-action-icon-retry`, `message-action-icon-copy`, `message-action-icon-up`, `message-action-icon-down`) |
| Queued messages | `queued`, `queued-chip` |
| Run notices | `run-notice` (plus `run-notice-interrupted`, `run-notice-attachment-pending`, `run-notice-compaction`, `run-notice-skill`, `run-notice-history-replaced`, `run-notice-chart-undrawable`, `run-notice-surface`, `run-notice-not-connected`, `run-notice-mcp-app`), `run-notice-icon`, `run-notice-text`, `run-notice-undo` |
| Tool cards | `tool-card` (plus one status modifier: `tool-card-pending`, `tool-card-deferred`, `tool-card-done`, `tool-card-error`, `tool-card-declined`, `tool-card-interrupted`), `tool-card-head`, `tool-card-icon`, `tool-card-name`, `tool-card-status` (plus `tool-card-status-pending`, `tool-card-status-deferred`, `tool-card-status-done`, `tool-card-status-error`, `tool-card-status-declined`, `tool-card-status-interrupted`), `tool-card-decision`, `tool-card-answered-by`, `tool-card-toggle`, `tool-card-body`, `tool-card-section` (plus `tool-card-args-section`, `tool-card-result-section`), `tool-card-section-label` (plus `tool-card-args-label`, `tool-card-result-label`), `tool-card-args`, `tool-card-result`, `tool-card-approval`, `tool-card-subagent`, `tool-card-repeat` |
| Tool-step group | `tool-group` (plus one state modifier: `tool-group-waiting`, `tool-group-running`, `tool-group-done`, `tool-group-error`), `tool-group-head`, `tool-group-icon`, `tool-group-label`, `tool-group-meta`, `tool-group-list` |
| Delegated sub-agents | `subagent`, `subagent-row`, `subagent-icon`, `subagent-status`, `subagent-steps`, `subagent-step`, `subagent-step-icon`, `subagent-step-name` |
| Child sessions | `child-session-link`, `parent-breadcrumb`, `parent-breadcrumb-link`, `child-report` (a child's report or question in its parent's transcript, with `data-origin` and `data-outcome`), `child-report-link` |
| Client-side confirmation | `confirm`, `confirm-body`, `confirm-args`, `confirm-actions`, `confirm-button` (plus `confirm-confirm`, `confirm-cancel`, `confirm-always`) |
| An MCP Apps view's consent card | the same parts as the confirmation card, with `mcp-app-consent` beside `confirm` on the card |
| Server-side approval | `approval`, `approval-body`, `approval-actions`, `approval-button` (plus `approval-approve`, `approval-deny`), `approval-edit`, `approval-args`, `approval-error` |
| Typed question | `question`, `question-body`, `question-options`, `question-choice`, `question-choice-text`, `question-radio`, `question-input`, `question-actions`, `question-button` |
| Composer | `composer`, `composer-surface`, `composer-tools`, `input`, `send`, `attach-button`, `voice-button` |
| Place chip | `place` (carries `data-excluded` while the user withholds the place), `place-icon`, `place-label`, `place-detail`, `place-toggle` |
| Attachments | `attachment-tray`, `attachment-chips` (the read-only chips on sent bubbles), and the shared chip parts `attachment-chip`, `attachment-chip-icon`, `attachment-chip-name`, `attachment-chip-size`, `attachment-chip-bar`, `attachment-chip-bar-fill`, `attachment-chip-retry`, `attachment-chip-remove` |
| Skills | `skill-chips`, `skill-chip`, `skill-palette`, `skill-item`, `skill-item-title`, `skill-item-desc`, `skill-item-token`, `skill-hint` (the composer hint: a skill’s missing placeholders, and a run continuation picked with nothing typed or while a run is in flight), `skill-manage` (the "Manage skills" row, also a `skill-item`) |
| Full-panel view | `panel-view`, `panel-view-bar`, `panel-view-title`, `panel-view-body`, `panel-view-footer`, and in its bar `back-button` |
| Skill editor | `skill-rows`, `skill-row`, `skill-scope`, `skill-empty`, `skill-form`, and in the view's bar `new-skill-button` |
| Routines | `routine-rows`, `routine-row`, `routine-empty`, `routine-last`, `routine-toggle`, `routine-run`, `make-routine`, `routine-form`, `routine-day`, `routine-time` (the hour and minute group), `routine-tools`, `routine-tool`, `routine-destructive`, and in the view's bar `new-routine-button` |
| Thread drawer | `drawer`, `drawer-backdrop`, `drawer-panel`, `drawer-header`, `drawer-title`, `drawer-new`, `drawer-close`, `drawer-filter`, `drawer-list`, `drawer-empty`, `drawer-group-label`, `drawer-row` (plus `drawer-row-child` on a child session's row), `drawer-children`, `drawer-row-select`, `drawer-row-title`, `drawer-row-routine` (on a routine's run), `drawer-row-time`, `drawer-row-preview`, `drawer-row-actions`, `drawer-row-rename`, `drawer-row-delete`, `drawer-rename-input`, `drawer-confirm`, `drawer-confirm-label`, `drawer-confirm-yes`, `drawer-confirm-no` |
| Charts | `chart-block`, `chart-title`, `chart-legend` |
| Checkpoints panel | `checkpoints`, `checkpoints-header`, `checkpoints-title`, `checkpoints-list`, `checkpoints-empty`, `checkpoint-row`, `checkpoint-label`, `checkpoint-time`, `checkpoint-id`, `checkpoint-branch`, `checkpoint-actions` (the pair's wrapper), `checkpoint-action` (plus `checkpoint-resume`, `checkpoint-fork`) |

> **Hiding `::part(header)` hides the controls inside it.** The history, checkpoints, new-chat,
> theme and collapse buttons are all children of the header, so a host that renders its own title
> bar and does `ag-ui-chat::part(header) { display: none }` loses thread switching entirely. Every
> one of them has an imperative equivalent, so your own chrome can drive them:
>
> | Control | Method |
> | --- | --- |
> | History drawer | `chat.openThreads()` |
> | Checkpoints panel | `chat.openCheckpoints()` |
> | New chat | `chat.newChat()` |
> | Collapse | `chat.toggleCollapsed()` / `chat.setCollapsed(bool)` |
> | Theme toggle | `chat.toggleTheme()` |
>
> ```js
> myHeaderButton.onclick = () => chat.openThreads();
> ```
>
> The built-in buttons call exactly these methods, so the two routes cannot drift. If you only want
> to restyle the header, prefer `::part(header)` styling or the `header-actions` slot over hiding it.
>
> To drop single controls instead, hide their parts:
> `ag-ui-chat::part(history-button), ag-ui-chat::part(new-button) { display: none }`.
> `display: none` removes them from the accessibility tree and the tab order as well.

Coarse **slots** let you replace whole regions with your own markup (project light-DOM children
with a matching `slot=`):

| Slot | Where |
| --- | --- |
| `icon` | A header brand icon, before the title. |
| `header-actions` | Extra controls between the title and the built-in buttons. |
| `greeting` | The greeting's text, above the empty state, where the [greeting layout](#the-greeting-on-an-empty-page) is on. Replaces the text only; `empty` and the starters still render beneath it. |
| `empty` | The empty-state shown before any message. |
| `above-composer` | Directly above the composer, below the skill chips, hint, queued turns and attachment tray. Takes no space when empty, and moves with the composer in the [greeting layout](#the-greeting-on-an-empty-page). |
| `footer` | Below the composer. |
| `launcher` | The collapsed widget's mark — the floating launcher, or the sidebar rail. |
| `icon-send` / `icon-stop` | The composer button's two glyphs (idle and mid-run). |
| `icon-attach` / `icon-voice` | The paperclip and mic glyphs. |
| `icon-history` / `icon-checkpoints` / `icon-new` / `icon-maximize` / `icon-collapse` | The header controls' glyphs. A slotted `icon-collapse` wins over `data-collapse-icon`. |

```html
<ag-ui-chat endpoint="/agent/">
  <img slot="icon" src="/logo.svg" alt="" />
  <button slot="header-actions" onclick="openHelp()">?</button>
</ag-ui-chat>
```

## Header and launcher icon

Give the header a brand icon with either the `icon` slot (any markup) or the `data-icon-url`
convenience attribute (an `<img>`); the slot wins when both are set, and with neither the header
stays icon-less. The same icon seam feeds the collapsed sidebar rail. Size it via
`--ag-ui-icon-size` (default `22px`) and round it with `--ag-ui-icon-radius` (default `4px`).

```html
<ag-ui-chat endpoint="/agent/" data-icon-url="/logo.png"></ag-ui-chat>
```

## Sidebar placement

`placement="sidebar"` is a full-height **docked** panel that slides open/closed and collapses to a
slim **icon rail** rather than the [floating launcher](header-and-panel.md#collapsing-to-the-launcher) — the same
element, shaped by the placement. It docks right by default; `data-side="left"` docks it left. The
panel slides out through the edge it docks against. Collapse state reuses the `collapsed` attribute
(persisted per-tab), and the rail carries `aria-expanded`. The slide honours
`prefers-reduced-motion`.

```html
<ag-ui-chat endpoint="/agent/" placement="sidebar" data-side="left"></ag-ui-chat>
```

It overlays the page by default (no host-layout coupling). To make the host content reflow around
it instead, set `--ag-ui-position: static` and place the element in your own grid/flex layout.

## Page placement

`placement="page"` turns the widget into a full-screen chat **page**: a full-bleed background with
the conversation in a centred reading column (default ~820px, set via `--ag-ui-content-max-width`).
The assistant turn spans the column width while the user message stays a right-aligned pill. Unlike
`full` (edge-to-edge, left-aligned), it's the layout you want for a dedicated `/chat` route. Pairs
naturally with the [answer well](#the-answer-well).

```html
<ag-ui-chat endpoint="/agent/" placement="page" data-answer-well></ag-ui-chat>
```

### The greeting on an empty page

Until the first message is sent, a page shows a greeting with the composer centred beneath it,
and the composer moves to the foot of the page once the conversation has something in it. On a
phone it starts at the foot, for the reason below.

```html
<ag-ui-chat endpoint="/agent/" placement="page" user-name="Ada"></ag-ui-chat>
```

- **The text** is `Hello, {name}`, filled from `user-name`, or `Hello there` when there is no
  name. Both are string-table keys, `greeting` and `greetingNoName`, so `strings` and
  `data-strings` translate them like everything else. `user-name` is live: a name that arrives
  after an auth handshake replaces the greeting on screen.
- **Your own greeting** goes in `slot="greeting"`, which replaces the text and nothing else. A
  brand mark belongs there too. The `empty` slot and `data-starters` still render beneath it.
- **Styling**: the `greeting` part, plus `--ag-ui-greeting-font` (default: the widget's font) and
  `--ag-ui-greeting-size` (default `clamp(1.5rem, 4vw, 2.25rem)`, scaling with the viewport rather
  than stepping at a breakpoint).
- **`data-empty`** is present on the element while the conversation is empty, for chrome of your
  own that should react to the same state.
- **Which placements**: on by default for `page`, which is a route of its own. `data-greeting="off"`
  restores the plain layout there. `embedded` opts in with `data-greeting` (any value but `off`),
  for an app shell that gives the panel a page-sized box. The corner placements and the sidebar
  never show it: a panel opened from a launcher is already mid-task.
- **On a phone** the composer stays at the foot, the starters (or your own `empty` content) sit
  against it, and the greeting takes the middle of what they leave — the middle of the
  transcript when there are none. Centring is a shape for a screen with room to spare; at
  [600px wide and below](#small-viewports) the room is what the on-screen keyboard takes, and a
  composer centred over an empty band sits halfway up what is left of the screen, with the
  prompts that start a conversation nowhere near the field that sends one.
  `data-small-viewport="off"` keeps the centred shape at every width, as it keeps the rest of
  the desktop layout.

The composer's rows stay centred while you type, while a draft grows and while attachments are
added, because the centring is two equal flexible halves either side of them and growth splits
into both. Nothing in the DOM moves, so focus, the caret and IME composition are unaffected.

**Sending is what moves it**, not typing, and the composer slides to the foot of the page over
`--ag-ui-motion` (a single frame under reduced motion). Everything else that changes the
conversation snaps: a restored conversation mounts docked, picking a thread from the list or
continuing a run docks at once, and a new chat returns to the centre at once. While a slow
conversation store is still fetching, the page stays docked with the greeting hidden, so a
restored conversation never paints the empty layout first.

## The answer well

Each assistant turn renders inside one `.answer` group (part `answer`) that holds its streamed
text, tool cards, and pending indicator — so a turn that calls tools reads as a single answer
rather than a string of loose siblings. Add the boolean `data-answer-well` attribute to box that
group in a bordered, padded "well"; without it the layout is the flat stack as before. The well is
pure CSS and turn-scoped — no JS API — and themeable via `--ag-ui-well-bg`, `--ag-ui-well-border`
and `--ag-ui-well-radius` (and `::part(answer)`).

The well's corners default to `--ag-ui-radius`, 12px unless you set it, in every placement. The
panel's own frame is different: `page` and `sidebar` draw it square because it meets the edge of
the window, but nothing inside the panel does, so the well stays round there too. Set
`--ag-ui-well-radius` to round the well differently from the rest of the panel.

```html
<ag-ui-chat endpoint="/agent/" data-answer-well></ag-ui-chat>
```

## Model reasoning (thoughts)

When a reasoning model streams its chain-of-thought (django-ag-ui forwards it as AG-UI reasoning
events — enable a thinking budget via `MODEL_SETTINGS`, see its docs), the element renders a muted,
collapsible **thoughts region** (part `thoughts`) at the top of the current answer group. It opens
while the model reasons and folds away on the answer's first token; the reader can reopen it. The
web component handles the `REASONING_*` event family (and the retired `THINKING_*`, which
`@ag-ui/client` still converts onto it, with a console warning, during its deprecation window), so
no client config is needed — the thoughts appear whenever the server forwards reasoning.

The header is a toggle only once reasoning has text: a provider that opens and closes reasoning
without sending any (redacted thinking, or summaries off) gets a plain label with no body, and no
`thoughts-toggle` part. When reasoning ends the header settles to how long it took, string
`thoughtFor` (`"Thought for {seconds}s"`, the sum of the turn's reasoning rounds); under a second it
reads `thoughts`. A tool call likewise offers its details only over something: with no arguments
and a blank result its toggle, and a one-step group's row, are not offered until a result with text
arrives.

## The composer

The composer is one bordered surface (part `composer-surface`) that owns the border and the focus
ring: the field sits on top and grows with what is typed until it hits its ceiling and scrolls,
and a tool row (part `composer-tools`) sits underneath with the paperclip and mic as quiet icon
buttons on the left and a circular **Send** on the right. Send is icon-only — its accessible name
still comes from the `send` / `stop` [strings](i18n.md#internationalization-i18n) — and it becomes the
Stop control mid-run by swapping its glyph, so nothing moves when a run starts.

```css
ag-ui-chat {
  --ag-ui-composer-radius: 14px;
  --ag-ui-composer-max-height: 40vh;  /* where the growing field starts scrolling */
  --ag-ui-tool-btn-size: 30px;        /* the paperclip / mic hit targets */
  --ag-ui-send-size: 30px;            /* the send circle */
  --ag-ui-glyph-size: 18px;
  --ag-ui-glyph-stroke: 1.75;
}
```

Every glyph is a slot with the built-in mark as its fallback (`icon-send`, `icon-stop`,
`icon-attach`, `icon-voice`), so projecting your own icon set never means restyling a character.

## Motion

One duration and two curves drive every collapse, expand and slide-over, so the whole widget
settles as one thing:

```css
ag-ui-chat {
  --ag-ui-motion: 0.28s;
  --ag-ui-ease: cubic-bezier(0.32, 0.72, 0, 1);      /* the settle */
  --ag-ui-ease-pop: cubic-bezier(0.34, 1.36, 0.64, 1); /* the arrival, with overshoot */
}
```

Under `prefers-reduced-motion: reduce` the duration collapses to a single frame: states still
change, nothing travels. Set `--ag-ui-motion: 0s` to switch the animation off outright.

## Voice input

Set `data-transcribe-url` (django-ag-ui's `TranscribeView`) to reveal a mic button in the
composer (part `voice-button`). Click it to record via `MediaRecorder`, click again to stop — the
clip is POSTed to the endpoint and the returned transcript is dropped into the textarea. Swap the
transport with a custom `transcribeHandler` — `(audio: Blob) => Promise<string>` — to use a
different STT endpoint or a browser Web Speech adapter without touching the button; when set, the
mic appears even with no `data-transcribe-url`.

```html
<ag-ui-chat endpoint="/agent/" data-transcribe-url="/agent/transcribe/"></ag-ui-chat>
```

## Theme toggle

`theme` is a plain attribute you can set yourself, and a host can always drop its own switch into
`slot="header-actions"`. For convenience, the boolean `data-theme-toggle` attribute adds a built-in
light⇄dark toggle to the header (part `theme-toggle`) that flips the scheme word of `theme` and
persists the choice per tab. Only the scheme changes: `soft` becomes `soft dark`, `soft dark`
becomes `soft light`, and `auto` becomes the opposite of what the system shows, an explicit
choice. With no scheme word the toggle flips the scheme the panel is drawn in, so a host rule
that sets the element's `color-scheme` (to follow the page's own dark mode) is flipped from,
and the written word then holds against that rule. The toggle's glyph follows a `theme` the host
writes later too, so a host's own picker and the toggle never disagree, and under `auto` it
follows the system's `prefers-color-scheme` as it changes. One change it cannot see: a host rule
that changes the element's `color-scheme` at runtime (a class swapped on your page, say) fires no
event, so the glyph keeps the scheme it last drew until the next click or `theme` write. Write the
scheme word into `theme` instead, or set `theme` again after your rule changes. Only the scheme
is saved, too:
on the next load it is put beside whatever theme name the markup carries, so `dark` chosen on a
`soft` page restores as `classic dark` on a `classic` one. Off by default so it never competes with
a host-supplied control.

```html
<ag-ui-chat endpoint="/agent/" data-theme-toggle></ag-ui-chat>
```
