import { createHash, timingSafeEqual } from "node:crypto";

// Hashing first gives equal-length buffers, so the comparison time doesn't leak
// the expected token's length either.
export function tokensEqual(expected: string, provided: string): boolean {
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}
