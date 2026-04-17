/**
 * contextBridge.ts — Side-panel-side API for querying and invoking WebMCP tools
 * on the active browser tab.
 *
 * Implementation note: We use chrome.scripting.executeScript (programmatic injection)
 * rather than a persistent content script. This means:
 *   - No content_scripts entry in manifest.json is needed.
 *   - Injection happens on demand, only after user consent.
 *   - Requires the "scripting" and "activeTab" permissions in manifest.json.
 *
 * Reading navigator.modelContext from an extension context script:
 *   navigator.modelContext is a property injected by Chrome into the page's
 *   main world. Content scripts run in an isolated world and do NOT have access
 *   to the page's navigator.modelContext by default. Using executeScript with
 *   world: 'MAIN' grants access to the same JS heap as the page, which is how
 *   we can read the registered tools.
 */

import type { ActiveTabToolContext, ToolInvocationResult, WebMcpToolDescriptor } from './types';

/**
 * Returns the active tab in the current window, or null if unavailable.
 */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      resolve(tabs[0] ?? null);
    });
  });
}

/**
 * Queries the active tab for any WebMCP tools registered on navigator.modelContext.
 * Returns null if:
 *   - No active tab is found
 *   - The tab is a chrome:// or extension page (scripting not allowed)
 *   - The tab has no navigator.modelContext
 *   - Permission is denied
 */
export async function queryActiveTabTools(): Promise<ActiveTabToolContext | null> {
  let tab: chrome.tabs.Tab | null = null;
  try {
    tab = await getActiveTab();
    if (!tab?.id || !tab.url) return null;

    // Chrome extensions cannot inject into chrome:// pages, extension pages, etc.
    const url = new URL(tab.url);
    if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:' || url.protocol === 'about:') {
      return null;
    }

    type InjectedResult = { tools: WebMcpToolDescriptor[]; origin: string; title: string } | null;

    const results = await chrome.scripting.executeScript<[], InjectedResult>({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (): InjectedResult => {
        // This runs in the page's main world — navigator.modelContext is accessible here.
        const mc = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
        if (!mc) return null;

        // The WebMCP API (as of Chrome 146 early preview) does not expose a tools list
        // directly on modelContext. We probe the internal _tools map that Chrome
        // populates when registerTool() is called. Fallback: try calling listTools()
        // if available (future API surface), or read the __webmcp_tools__ sentinel that
        // some polyfills expose on window.
        type McInternal = {
          _tools?: Map<string, { name: string; description: string; inputSchema?: object; outputSchema?: object; annotations?: Record<string, unknown> }>;
          listTools?: () => Array<{ name: string; description: string; inputSchema?: object; outputSchema?: object; annotations?: Record<string, unknown> }>;
        };
        const mcInternal = mc as unknown as McInternal;

        let rawTools: Array<{ name: string; description: string; inputSchema?: object; outputSchema?: object; annotations?: Record<string, unknown> }> = [];

        if (typeof mcInternal.listTools === 'function') {
          // Future API: listTools()
          try { rawTools = mcInternal.listTools(); } catch { rawTools = []; }
        } else if (mcInternal._tools instanceof Map) {
          // Internal Map exposed by the Chrome 146 preview implementation
          rawTools = Array.from(mcInternal._tools.values());
        } else {
          // Polyfill / demo sentinel: window.__webmcp_tools__
          const sentinel = (window as Window & { __webmcp_tools__?: typeof rawTools }).__webmcp_tools__;
          if (Array.isArray(sentinel)) rawTools = sentinel;
        }

        const tools = rawTools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema ?? {},
          outputSchema: t.outputSchema,
          annotations: t.annotations,
        }));

        return {
          tools,
          origin: window.location.origin,
          title: document.title,
        };
      },
    });

    const result = results?.[0]?.result;
    if (!result) return null;

    return {
      origin: result.origin,
      title: result.title,
      tools: result.tools,
      retrievedAt: Date.now(),
    };
  } catch (err) {
    // Permission denied, tab navigated away, etc. — treat as no WebMCP.
    console.debug('[contextBridge] queryActiveTabTools failed (non-fatal):', err);
    return null;
  }
}

/**
 * Invokes a named tool on the active tab by executing it in the page's main world.
 * The execute function lives in the page's JS heap and is not serializable across
 * worlds, so we call it via executeScript with world: 'MAIN'.
 */
export async function invokeActiveTabTool(
  toolName: string,
  input: unknown
): Promise<ToolInvocationResult> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { toolName, input, output: null, error: 'No active tab found' };
  }

  try {
    const results = await chrome.scripting.executeScript<[string, unknown], unknown>({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (name: string, args: unknown): unknown => {
        const mc = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
        if (!mc) return { __error: 'No WebMCP on this tab' };

        type McInternal = {
          _tools?: Map<string, { name: string; execute?: (input: unknown) => unknown }>;
          listTools?: () => Array<{ name: string; execute?: (input: unknown) => unknown }>;
        };
        const mcInternal = mc as unknown as McInternal;

        let tool: { name: string; execute?: (input: unknown) => unknown } | undefined;

        if (typeof mcInternal.listTools === 'function') {
          try {
            const all = mcInternal.listTools();
            tool = all.find(t => t.name === name);
          } catch { /* fall through */ }
        }

        if (!tool && mcInternal._tools instanceof Map) {
          tool = mcInternal._tools.get(name);
        }

        if (!tool) {
          // Polyfill sentinel
          const sentinel = (window as Window & { __webmcp_tools__?: Array<{ name: string; execute?: (input: unknown) => unknown }> }).__webmcp_tools__;
          if (Array.isArray(sentinel)) tool = sentinel.find(t => t.name === name);
        }

        if (!tool?.execute) return { __error: `Tool "${name}" not found or has no execute()` };

        try {
          // execute may return a Promise — the executeScript func can return a Promise,
          // Chrome will await it before resolving the outer Promise.
          return tool.execute(args);
        } catch (e) {
          return { __error: e instanceof Error ? e.message : String(e) };
        }
      },
      args: [toolName, input],
    });

    const raw = results?.[0]?.result;

    // Check for sentinel error objects
    if (raw && typeof raw === 'object' && '__error' in (raw as object)) {
      return {
        toolName,
        input,
        output: null,
        error: (raw as { __error: string }).__error,
      };
    }

    return { toolName, input, output: raw };
  } catch (err) {
    return {
      toolName,
      input,
      output: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
