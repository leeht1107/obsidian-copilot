/**
 * Blocklist Checker
 *
 * Checks bash commands against user-defined blocklist patterns.
 * Patterns are treated as case-insensitive regex with fallback to substring match.
 */

/**
 * Normalize a command string for blocklist matching.
 * Collapses whitespace and strips backslash escapes to defeat trivial bypasses.
 */
function normalizeCommand(command: string): string {
  // Strip backslash escapes: remove standalone backslashes that escape next char
  let result = command.replace(/\\(.)/g, '$1');
  // Collapse consecutive whitespace to single space
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

/**
 * Check if a bash command should be blocked by user-defined patterns.
 *
 * @param command - The bash command to check
 * @param patterns - Array of blocklist patterns (regex or substring)
 * @param enableBlocklist - Whether blocklist checking is enabled
 * @returns true if the command should be blocked
 */
export function isCommandBlocked(
  command: string,
  patterns: string[],
  enableBlocklist: boolean
): boolean {
  if (!enableBlocklist) {
    return false;
  }

  const normalized = normalizeCommand(command);

  return patterns.some((pattern) => {
    try {
      const re = new RegExp(pattern, 'i');
      return re.test(command) || re.test(normalized);
    } catch {
      // Invalid regex - fall back to substring match
      const lowerPattern = pattern.toLowerCase();
      return command.toLowerCase().includes(lowerPattern) ||
        normalized.toLowerCase().includes(lowerPattern);
    }
  });
}

/**
 * Validate a blocklist pattern.
 *
 * @param pattern - The pattern to validate
 * @returns Object with isValid flag and optional error message
 */
export function validateBlocklistPattern(pattern: string): { isValid: boolean; error?: string } {
  if (!pattern.trim()) {
    return { isValid: false, error: 'Pattern cannot be empty' };
  }

  try {
    new RegExp(pattern, 'i');
    return { isValid: true };
  } catch (e) {
    // Pattern is invalid as regex but will work as substring match
    return {
      isValid: true,
      error: `Invalid regex, will use substring match: ${e instanceof Error ? e.message : 'unknown error'}`,
    };
  }
}
