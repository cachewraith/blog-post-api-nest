const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/**
 * Convert a JWT-style duration ("15m", "7d", "3600") to seconds.
 * Throws on anything unparseable so a typo in the env fails at boot rather
 * than silently minting tokens with the wrong lifetime.
 */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());

  if (!match) {
    throw new Error(
      `Invalid duration: "${value}" (expected e.g. 15m, 7d, 900)`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? 's';

  return amount * UNIT_SECONDS[unit];
}
