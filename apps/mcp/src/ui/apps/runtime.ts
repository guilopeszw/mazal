// ─── apps/mcp/src/ui/apps/runtime.ts ──────────────────────────────────────
// The one MCP Apps lifecycle both views share. Two hosts render these views:
//
// - Studio chat: the agent already called the tool, and the host pushes
//   `ui/notifications/tool-input` then `tool-result` right after `connect()`.
// - A home tile: Studio passes only the configured `toolInput` — no result —
//   and opens a direct MCP client to the connection so the view may call the
//   tool itself by its bare name.
//
// So: render on `ontoolresult` when it comes; if only input ever arrives, call
// the tool with it and render what the server returns. Every number still
// comes out of the engine — the view only chooses when to ask for it.

import { App, applyDocumentTheme } from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// ponytail: 400ms is the arbitration between "result is on its way" (chat) and
// "no result is coming" (home tile). Rendering is idempotent, so losing the
// race twice just paints the same data twice.
const RESULT_GRACE_MS = 400;

export function structuredResult(result: CallToolResult): unknown {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((c) => c.type === 'text');
  return text ? JSON.parse(text.text) : undefined;
}

export function runView(options: {
  name: string;
  toolName: string;
  render: (result: unknown, input: Record<string, unknown> | undefined) => void;
  renderError: (message: string) => void;
}): void {
  const app = new App({ name: options.name, version: '0.1.0' });
  let input: Record<string, unknown> | undefined;
  let rendered = false;

  const paint = (result: CallToolResult) => {
    rendered = true;
    try {
      options.render(structuredResult(result), input);
    } catch (error) {
      options.renderError(error instanceof Error ? error.message : String(error));
    }
  };

  app.ontoolinput = (params) => {
    input = params.arguments as Record<string, unknown> | undefined;
    setTimeout(() => {
      if (rendered || !input) return;
      app
        .callServerTool({ name: options.toolName, arguments: input })
        .then(paint)
        .catch((error: unknown) =>
          options.renderError(error instanceof Error ? error.message : String(error)),
        );
    }, RESULT_GRACE_MS);
  };

  app.ontoolresult = paint;

  app
    .connect()
    .then(() => {
      const theme = app.getHostContext()?.theme;
      if (theme) applyDocumentTheme(theme);
    })
    .catch((error: unknown) =>
      options.renderError(error instanceof Error ? error.message : String(error)),
    );

  app.onhostcontextchanged = (context) => {
    if (context.theme) applyDocumentTheme(context.theme);
  };
}
