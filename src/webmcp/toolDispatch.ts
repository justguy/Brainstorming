type ToolCompletionPayload<T extends object> = T & { ok: boolean; error?: string };

export function dispatchAndWait(
  eventName: string,
  detail: Record<string, unknown> = {},
  successMessage = 'Action completed successfully',
  timeoutMs = 8000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const completionEvent = `tool-completion-${requestId}`;

    const timeoutId = setTimeout(() => {
      window.removeEventListener(completionEvent, handleCompletion);
      reject(new Error(`Timed out waiting for UI to update (requestId: ${requestId})`));
    }, timeoutMs);

    const handleCompletion = () => {
      clearTimeout(timeoutId);
      window.removeEventListener(completionEvent, handleCompletion);
      resolve(successMessage);
    };

    window.addEventListener(completionEvent, handleCompletion);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ...detail, requestId } }));
  });
}

export function dispatchAndWaitForResult<T extends object>(
  eventName: string,
  detail: Record<string, unknown> = {},
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substring(2, 15);
    const completionEvent = `tool-completion-${requestId}`;

    const timeoutId = setTimeout(() => {
      window.removeEventListener(completionEvent, handleCompletion as EventListener);
      reject(new Error(`Timed out waiting for UI to update (requestId: ${requestId})`));
    }, timeoutMs);

    const handleCompletion = (event: Event) => {
      const ev = event as CustomEvent<ToolCompletionPayload<T>>;
      clearTimeout(timeoutId);
      window.removeEventListener(completionEvent, handleCompletion as EventListener);
      if (!ev.detail?.ok) {
        reject(new Error(ev.detail?.error ?? 'Action failed'));
        return;
      }
      const { ok: _ok, error: _error, ...data } = ev.detail;
      resolve(data as T);
    };

    window.addEventListener(completionEvent, handleCompletion as EventListener);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ...detail, requestId } }));
  });
}
