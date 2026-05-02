import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";

const secret = Bun.env.JWT_SECRET ?? "dev-fallback";

export type AuthVariables = {
  userId: number;
};

const UNAUTHORIZED = { errors: { token: ["is missing"] } };

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const unauthorized = () => c.json(UNAUTHORIZED, 401);

    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Token ")) {
      return unauthorized();
    }

    const token = header.slice("Token ".length);

    try {
      const payload = await verify(token, secret, "HS256");
      if (typeof payload.sub !== "string") {
        return unauthorized();
      }
      c.set("userId", Number(payload.sub));
    } catch {
      return unauthorized();
    }

    await next();
  },
);

export type OptionalAuthVariables = {
  userId?: number;
};

export const optionalAuthMiddleware = createMiddleware<{
  Variables: OptionalAuthVariables;
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Token ")) {
    await next();
    return;
  }

  const token = header.slice("Token ".length);

  try {
    const payload = await verify(token, secret, "HS256");
    if (typeof payload.sub === "string") {
      c.set("userId", Number(payload.sub));
    }
  } catch {
    // token が不正でも anonymous として通す
  }

  await next();
});
