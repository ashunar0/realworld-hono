import { Hono } from "hono";
import { sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { db } from "./db";
import {
  createUserSchema,
  loginUserSchema,
  updateUserSchema,
  type AuthUserResponse,
  type UserRow,
} from "./schemas/user";
import { authMiddleware, type AuthVariables } from "./middleware/auth";

const secret = Bun.env.JWT_SECRET ?? "dev-fallback";

const app = new Hono<{ Variables: AuthVariables }>();

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

    const fail = () =>
      c.json({ errors: { body: ["email or password is invalid"] } }, 422);

    const row = db
      .query(
        `SELECT id, username, email, password_hash, bio, image
         FROM users
         WHERE email = ?`,
      )
      .get(email) as (UserRow & { password_hash: string }) | undefined;
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

// ユーザー情報取得
app.get("/api/user", authMiddleware, async (c) => {
  const userId = c.get("userId");

  const row = db
    .query("SELECT id, username, email, bio, image FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;
  if (!row) return c.json({ errors: { body: ["user not found"] } }, 404);

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
});

// ユーザー情報更新
app.put(
  "/api/user",
  authMiddleware,
  zValidator("json", updateUserSchema, (result, c) => {
    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${issue.path.join(".")} ${issue.message}`,
      );
      return c.json({ errors: { body: messages } }, 422);
    }
  }),
  async (c) => {
    const userId = c.get("userId");
    const { user } = c.req.valid("json");

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (user.email !== undefined) {
      updates.push("email = ?");
      values.push(user.email);
    }
    if (user.username !== undefined) {
      updates.push("username = ?");
      values.push(user.username);
    }
    if (user.password !== undefined) {
      updates.push("password_hash = ?");
      values.push(await Bun.password.hash(user.password));
    }
    if (user.bio !== undefined) {
      updates.push("bio = ?");
      values.push(user.bio);
    }
    if (user.image !== undefined) {
      updates.push("image = ?");
      values.push(user.image);
    }

    updates.push("updated_at = datetime('now')");
    values.push(userId);

    const row = db
      .query(
        `UPDATE users SET ${updates.join(", ")}
         WHERE id = ?
         RETURNING id, username, email, bio, image`,
      )
      .get(...values) as UserRow | undefined;

    if (!row) return c.json({ errors: { body: ["user not found"] } }, 404);

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
