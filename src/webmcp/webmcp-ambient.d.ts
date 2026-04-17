/**
 * Ambient type declarations for the WebMCP imperative API.
 * Augments the global `Navigator` interface with `modelContext`.
 *
 * Based on the WebMCP Early Preview spec and
 * /webmcp-tools/demos/shared/types/webmcp.d.ts.
 *
 * This file uses the `declare global` pattern so it can be imported
 * as a module (with a top-level `export {}`) while still augmenting
 * the global scope — required when `isolatedModules` is true.
 */

export {};

declare global {
  /**
   * Client object passed to tool `execute` callbacks.
   * Allows tools to request gated, user-visible side effects.
   */
  interface ModelContextClient {
    /**
     * Requests permission to perform a user-visible side effect.
     * The browser may prompt the user before invoking `callback`.
     *
     * @param callback - Side-effect function executed once approved.
     */
    requestUserInteraction(callback: () => void): void;
  }

  /**
   * Signal-like object passed as the second argument to `execute`.
   * Carries the `AbortSignal` from the registration options, giving
   * tool implementations a way to cancel in-flight async work when the
   * tool is unregistered.
   */
  interface ModelContextToolSignal {
    /** The abort signal linked to the registration's AbortController. */
    readonly signal?: AbortSignal;
  }

  /**
   * A single tool registered with the model context.
   * Follows WebMCP best practices: positive descriptions, explicit JSON
   * Schema types, and descriptive errors returned from the function body
   * (never thrown as exceptions from `execute`).
   */
  interface ModelContextTool {
    /** Unique, stable identifier for the tool (snake_case recommended). */
    name: string;

    /**
     * Natural-language description of what the tool does.
     * Use positive, present-tense phrasing, e.g. "Returns the list of…".
     * Agents use this for tool selection — be specific and unambiguous.
     */
    description: string;

    /**
     * JSON Schema describing the tool's expected input object.
     * Omit or pass `{}` for tools that take no arguments.
     * Prefer `required` arrays and explicit `type` fields on every property.
     */
    inputSchema?: object;

    /**
     * JSON Schema describing the tool's return value.
     * Optional but strongly recommended for type-safe agent consumption.
     */
    outputSchema?: object;

    /**
     * Called by the AI agent to execute this tool.
     *
     * @param input  - Parsed input matching `inputSchema`.
     * @param client - Client for requesting user interactions (browser-gated).
     * @returns A structured result sent back to the agent.
     *          On error, return a descriptive error object rather than throwing.
     */
    execute: (
      input: Record<string, unknown>,
      client: ModelContextClient,
    ) => unknown | Promise<unknown>;

    /** Optional hints about the tool's observable behaviour. */
    annotations?: {
      /**
       * If `true`, the tool reads state but does not mutate it.
       * Agents may invoke read-only tools freely without user confirmation.
       */
      readOnlyHint?: boolean;
      /**
       * If `true`, the tool may trigger UI changes visible to the user
       * (e.g. navigation, form submission).
       */
      destructiveHint?: boolean;
    };
  }

  /**
   * The model context API exposed on `navigator.modelContext`.
   * Present only in Chrome 146+ when the WebMCP flag is enabled.
   */
  interface ModelContext {
    /**
     * Registers a tool with the current model context.
     * The tool is automatically unregistered when `options.signal` is aborted.
     *
     * @param tool    - The tool descriptor to register.
     * @param options - Optional `AbortSignal` to control tool lifetime.
     */
    registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): void;

    /**
     * Removes a previously registered tool by name.
     * @deprecated Use AbortController/signal pattern instead.
     */
    unregisterTool?(name: string): void;
  }

  interface Navigator {
    /**
     * WebMCP model context API.
     * `undefined` when the browser does not support WebMCP or when the
     * `#enable-webmcp-testing` flag has not been enabled in Chrome 146+.
     */
    modelContext?: ModelContext;
  }
}
