import { Hono } from "hono";
import { sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { db } from "./db";
import {
  createUserSchema,
  loginUserSchema,
  type AuthUserResponse,
  type UserRow,
} from "./schemas/user";

const secret = Bun.env.JWT_SECRET ?? "dev-fallback";

const app = new Hono();

app.get("/", (c) => c.text("Hello Hono!"));

// 新規登録
app.post(
  "/api/users",
  zValidator("json", createUserSchema, (result, c) => {
    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${issue.path.join(".")} ${issue.message}`,
      );
      return c.json({ errors: { body: messages } }, 422);
    }
  }),
  async (c) => {
    const { username, email, password } = c.req.valid("json").user;
    const passwordHash = await Bun.password.hash(password);

    const row = db
      .query(
        `INSERT INTO users (username, email, password_hash)
         VALUES (?, ?, ?)
         RETURNING id, username, email, bio, image`,
      )
      .get(username, email, passwordHash) as UserRow;

    const token = await sign(
      {
        sub: String(row.id),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      secret,
      "HS256",
    );

    return c.json({
      user: {
        email: row.email,
        token,
        username: row.username,
        bio: row.bio,
        image: row.image,
      },
    } satisfies AuthUserResponse);
  },
);

// ログイン
app.post(
  "/api/users/login",
  zValidator("json", loginUserSchema, (result, c) => {
    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${issue.path.join(".")} ${issue.message}`,
      );
      return c.json({ errors: { body: messages } }, 422);
    }
  }),
  async (c) => {
    const { email, password } = c.req.valid("json").user;

    const row = db
      .query(
        `SELECT id, username, email, password_hash, bio, image
         FROM users
         WHERE email = ?`,
      )
      .get(email) as (UserRow & { password_hash: string }) | undefined;

    const fail = () =>
      c.json({ errors: { body: ["email or password is invalid"] } }, 422);

    if (!row) return fail();

    const ok = await Bun.password.verify(password, row.password_hash);
    if (!ok) return fail();

    const token = await sign(
      {
        sub: String(row.id),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      secret,
      "HS256",
    );

    return c.json({
      user: {
        email: row.email,
        token,
        username: row.username,
        bio: row.bio,
        image: row.image,
      },
    } satisfies AuthUserResponse);
  },
);

export default app;
