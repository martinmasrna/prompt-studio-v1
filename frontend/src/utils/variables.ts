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

export type PromptSegment =
  | { type: 'text'; value: string }
  | { type: 'var'; name: string; value: string | null }; // value null = unset/empty

/**
 * Split a prompt template into ordered segments of literal text and {{variable}}
 * placeholders, resolving each placeholder against `values`. A variable resolves
 * to `null` when it is missing or empty — callers render those distinctly.
 */
export function tokenizePrompt(template: string, values: Record<string, string>): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let last = 0;
  for (const m of template.matchAll(VARIABLE_RE)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ type: 'text', value: template.slice(last, start) });
    const value = values[m[1]];
    segments.push({ type: 'var', name: m[1], value: value?.trim() ? value : null });
    last = start + m[0].length;
  }
  if (last < template.length) segments.push({ type: 'text', value: template.slice(last) });
  return segments;
}
