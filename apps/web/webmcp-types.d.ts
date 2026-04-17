/**
 * WebMCP type declarations for the web app surface.
 * Augments Navigator with `modelContext` per the WebMCP browser standard.
 * Adapted from webmcp-tools/demos/shared/types/webmcp.d.ts
 */

export {};

declare global {
  /** Client object passed to tool execute callbacks. */
  interface ModelContextClient {
    /**
     * Requests permission to perform a user-visible side effect.
     */
    requestUserInteraction(callback: () => void): void;
  }

  /** A single tool registered with the model context. */
  interface ModelContextTool {
    /** Unique identifier for the tool. */
    name: string;

    /** Natural-language description of what the tool does and when to use it. */
    description: string;

    /** JSON Schema describing the tool's expected input. */
    inputSchema?: object;

    /** JSON Schema describing the tool's output. */
    outputSchema?: object;

    /**
     * Called by the AI agent to execute this tool.
     * @param input - The parsed input matching `inputSchema`.
     * @param client - Client for requesting user interactions.
     * @returns A result value sent back to the agent.
     */
    execute: (
      input: Record<string, unknown>,
      client: ModelContextClient,
    ) => unknown | Promise<unknown>;

    /** Optional hints about the tool's behavior. */
    annotations?: {
      /** If true, the tool does not mutate state. */
      readOnlyHint?: boolean;
    };
  }

  /** The model context API exposed on `navigator.modelContext`. */
  interface ModelContext {
    /** Adds a single tool to the current context. */
    registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): void;

    /** Removes a tool by name. (Deprecated — prefer AbortController signal.) */
    unregisterTool?(name: string): void;
  }

  interface Navigator {
    /** WebMCP model context API. Undefined if browser does not support WebMCP. */
    modelContext?: ModelContext;
  }
}
