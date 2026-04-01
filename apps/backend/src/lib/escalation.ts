const ESCALATION_PATTERNS: RegExp[] = [
  /i\s+(?:can't|cannot|am unable|do not|don't)\s+(?:help|answer|assist|provide)/i,
  /i\s+don'?t\s+have\s+(?:enough\s+)?information/i,
  /please\s+contact\s+(?:our\s+)?support/i,
  /let\s+me\s+connect\s+you\s+to\s+(?:a\s+)?human/i,
  /reach\s+out\s+to\s+(?:our\s+)?team/i,
];

export function shouldEscalateResponse(response: string): boolean {
  const normalized = response.trim();
  if (!normalized) {
    return true;
  }

  return ESCALATION_PATTERNS.some((pattern) => pattern.test(normalized));
}
