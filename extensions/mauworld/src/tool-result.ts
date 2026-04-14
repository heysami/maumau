export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return String(error);
}

export function textResult(text: string, details?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details: details ?? {},
  };
}

export function errorResult(error: unknown, prefix = "Mauworld request failed") {
  const message = formatErrorMessage(error);
  return textResult(`${prefix}: ${message}`, { error: message });
}
