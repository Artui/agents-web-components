import { PYDANTIC_AI_ACTIVITY_TYPE } from "../constants.js";
import { fillUiString } from "../ui/fill_ui_string.js";
import { renderRunNotice } from "../ui/progress/run_notice.js";
import { renderEnqueuedMessages } from "../ui/transcript/enqueued_messages.js";
import type { UiStrings } from "../ui/ui_strings.js";
import type { ActivityRegistration } from "./activity_registration.js";

/**
 * The built-in renderers for the activity types pydantic-ai's own AG-UI
 * adapter sends, so a server on it leaves nothing in `unhandledActivityTypes`
 * and that list goes on meaning "nobody here knows this name".
 *
 * Registered at construction like the other built-ins, so a host's own
 * registration for any of these names, always later, replaces it. `strings` is
 * read at draw time, so a string table set after construction still applies.
 */
export function adapterActivities(strings: () => UiStrings): readonly ActivityRegistration[] {
  const nothing = (): Node => document.createDocumentFragment();
  return [
    {
      type: PYDANTIC_AI_ACTIVITY_TYPE.ENQUEUED_MESSAGES,
      render: (content) => renderEnqueuedMessages(content, strings().enqueuedMessages),
    },
    {
      type: PYDANTIC_AI_ACTIVITY_TYPE.MCP_APPS,
      render: (content) => {
        const uri = (content as { readonly resourceUri?: unknown } | null)?.resourceUri;
        return renderRunNotice(
          "\u{1F5BC}",
          fillUiString(strings().mcpAppUnsupported, { uri: typeof uri === "string" ? uri : "" }),
          "mcp-app",
        );
      },
    },
    { type: PYDANTIC_AI_ACTIVITY_TYPE.COMPACTION, render: nothing },
    { type: PYDANTIC_AI_ACTIVITY_TYPE.TOOL_AVAILABILITY_DELTA, render: nothing },
    { type: PYDANTIC_AI_ACTIVITY_TYPE.MODEL_SETTINGS_DELTA, render: nothing },
    { type: PYDANTIC_AI_ACTIVITY_TYPE.CAPABILITY_LOAD_DELTA, render: nothing },
  ];
}
