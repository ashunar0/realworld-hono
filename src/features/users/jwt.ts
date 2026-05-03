import { sign } from "hono/jwt";

const secret = Bun.env.JWT_SECRET ?? "dev-fallback";

export async function signToken(userId: number): Promise<string> {
  return sign(
    {
      sub: String(userId),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    },
    secret,
    "HS256",
  );
}
