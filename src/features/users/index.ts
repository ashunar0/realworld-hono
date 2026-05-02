import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
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

const normalizeNullable = (
  v: string | null | undefined,
): string | null | undefined => (v === "" ? null : v);

const app = new Hono<{ Variables: AuthVariables }>()
  // 新規登録 POST /api/users
  .post("/users", validateJson(createUserSchema), async (c) => {
    const { username, email, password } = c.req.valid("json").user;

    const existingByEmail = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existingByEmail) {
      return c.json(
        { errors: { email: ["has already been taken"] } },
        409,
      );
    }
    const existingByUsername = await db.query.users.findFirst({
      where: eq(users.username, username),
    });
    if (existingByUsername) {
      return c.json(
        { errors: { username: ["has already been taken"] } },
        409,
      );
    }

    const passwordHash = await Bun.password.hash(password);

    const now = new Date().toISOString();
    const [row] = await db
      .insert(users)
      .values({ username, email, passwordHash, createdAt: now, updatedAt: now })
      .returning();
    if (!row) throw new Error("failed to insert user");

    const token = await signToken(row.id);

    return c.json(
      {
        user: {
          email: row.email,
          token,
          username: row.username,
          bio: row.bio,
          image: row.image,
        },
      } satisfies AuthUserResponse,
      201,
    );
  })
  // ログイン POST /api/users/login
  .post("/users/login", validateJson(loginUserSchema), async (c) => {
    const { email, password } = c.req.valid("json").user;

    const fail = () =>
      c.json({ errors: { credentials: ["invalid"] } }, 401);

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
    if (!row) return c.json({ errors: { user: ["not found"] } }, 404);

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

      if (user.email !== undefined) {
        const conflict = await db.query.users.findFirst({
          where: and(eq(users.email, user.email), ne(users.id, userId)),
        });
        if (conflict) {
          return c.json(
            { errors: { email: ["has already been taken"] } },
            409,
          );
        }
      }
      if (user.username !== undefined) {
        const conflict = await db.query.users.findFirst({
          where: and(eq(users.username, user.username), ne(users.id, userId)),
        });
        if (conflict) {
          return c.json(
            { errors: { username: ["has already been taken"] } },
            409,
          );
        }
      }

      const passwordHash = user.password !== undefined
        ? await Bun.password.hash(user.password)
        : undefined;

      const bio = normalizeNullable(user.bio);
      const image = normalizeNullable(user.image);

      const [row] = await db
        .update(users)
        .set({
          ...(user.email !== undefined && { email: user.email }),
          ...(user.username !== undefined && { username: user.username }),
          ...(passwordHash !== undefined && { passwordHash }),
          ...(user.bio !== undefined && { bio }),
          ...(user.image !== undefined && { image }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!row) return c.json({ errors: { user: ["not found"] } }, 404);

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
