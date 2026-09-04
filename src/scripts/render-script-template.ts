/**
 * Simple {{key}} substitution — deliberately not Handlebars: this renders
 * free-form sales copy as plain text (Handlebars' default HTML-escaping
 * would mangle quotes/apostrophes), and the feature set requested is exactly
 * "substitute these placeholders," nothing more.
 *
 * A placeholder with no matching (defined) value in `context` is left
 * untouched rather than blanked out, so a manager notices what they forgot
 * to fill in instead of sending a sentence with a silent gap.
 */
export function renderScriptTemplate(content: string, context: Record<string, unknown>): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = context[key];
    switch (typeof value) {
      case 'string':
        return value;
      case 'number':
      case 'boolean':
        return String(value);
      default:
        // undefined/null/object/etc. — leave the placeholder as-is rather
        // than risk printing "[object Object]" into a sales script.
        return match;
    }
  });
}
