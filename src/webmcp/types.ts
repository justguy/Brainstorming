export interface WebMcpToolDescriptor {
  name: string;
  description: string;
  inputSchema: object;
  outputSchema?: object;
  annotations?: Record<string, unknown>;
}

export interface ActiveTabToolContext {
  origin: string;         // e.g. "https://admin.example.com"
  title: string;          // tab title
  tools: WebMcpToolDescriptor[];
  retrievedAt: number;
}

export interface ToolInvocationResult {
  toolName: string;
  input: unknown;
  output: unknown;
  error?: string;
}
