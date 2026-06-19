// Utilities for detecting and substituting {{variable}} placeholders in prompt text.
const VARIABLE_RE = /\{\{(\w+)\}\}/g;

export function extractVariables(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(VARIABLE_RE)) seen.add(m[1]);
  return [...seen];
}

export function substituteVariables(text: string, values: Record<string, string>): string {
  return text.replace(VARIABLE_RE, (_, name: string) => values[name] ?? `{{${name}}}`);
}

export function missingVariables(text: string, values: Record<string, string>): string[] {
  return extractVariables(text).filter(name => !values[name]?.trim());
}
