import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/schema";
import {
  createUserSchema,
  loginUserSchema,
  updateUserSchema,
  type AuthUserResponse,
} from "../../schemas/user";
import { authMiddleware, type AuthVariables } from "../../middleware/auth";
import { validateJson } from "../../middleware/validator";
import { signToken } from "../../lib/jwt";

const app = new Hono<{ Variables: AuthVariables }>()
  // 新規登録 POST /api/users
  .post("/users", validateJson(createUserSchema), async (c) => {
    const { username, email, password } = c.req.valid("json").user;
    const passwordHash = await Bun.password.hash(password);

    const [row] = await db
      .insert(users)
      .values({ username, email, passwordHash })
      .returning();
    if (!row) throw new Error("failed to insert user");

    const token = await signToken(row.id);

    return c.json({
      user: {
        email: row.email,
        token,
        username: row.username,
        bio: row.bio,
        image: row.image,
      },
    } satisfies AuthUserResponse);
  })
  // ログイン POST /api/users/login
  .post("/users/login", validateJson(loginUserSchema), async (c) => {
    const { email, password } = c.req.valid("json").user;

    const fail = () =>
      c.json({ errors: { body: ["email or password is invalid"] } }, 422);

    const [row] = await db.select().from(users).where(eq(users.email, email));
    if (!row) return fail();

    const ok = await Bun.password.verify(password, row.passwordHash);
    if (!ok) return fail();

    const token = await signToken(row.id);

    return c.json({
      user: {
        email: row.email,
        token,
        username: row.username,
        bio: row.bio,
        image: row.image,
      },
    } satisfies AuthUserResponse);
  })
  // ユーザー情報取得 GET /api/user
  .get("/user", authMiddleware, async (c) => {
    const userId = c.get("userId");

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    if (!row) return c.json({ errors: { body: ["user not found"] } }, 404);

    const token = await signToken(row.id);

    return c.json({
      user: {
        email: row.email,
        token,
        username: row.username,
        bio: row.bio,
        image: row.image,
      },
    } satisfies AuthUserResponse);
  })
  // ユーザー情報更新 PUT /api/user
  .put(
    "/user",
    authMiddleware,
    validateJson(updateUserSchema),
    async (c) => {
      const userId = c.get("userId");
      const { user } = c.req.valid("json");

      const passwordHash = user.password !== undefined
        ? await Bun.password.hash(user.password)
        : undefined;

      const [row] = await db
        .update(users)
        .set({
          ...(user.email !== undefined && { email: user.email }),
          ...(user.username !== undefined && { username: user.username }),
          ...(passwordHash !== undefined && { passwordHash }),
          ...(user.bio !== undefined && { bio: user.bio }),
          ...(user.image !== undefined && { image: user.image }),
          updatedAt: sql`(datetime('now'))`,
        })
        .where(eq(users.id, userId))
        .returning();

      if (!row) return c.json({ errors: { body: ["user not found"] } }, 404);

      const token = await signToken(row.id);

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
