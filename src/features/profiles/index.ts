import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { follows, users } from "../../db/schema";
import {
  authMiddleware,
  optionalAuthMiddleware,
  type AuthVariables,
} from "../../middleware/auth";
import { toAuthorJson } from "../../lib/author";
import type { ProfileResponse } from "../../schemas/profile";

const app = new Hono<{ Variables: AuthVariables }>()
  .basePath("/profiles/:username")
  // プロフィール取得 GET /api/profiles/:username
  .get("/", optionalAuthMiddleware, async (c) => {
    const username = c.req.param("username");
    const userId = c.get("userId");

    const target = await db.query.users.findFirst({
      where: eq(users.username, username),
    });
    if (!target) {
      return c.json({ errors: { profile: ["not found"] } }, 404);
    }

    let following = false;
    if (userId !== undefined) {
      const [own] = await db
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerId, userId),
            eq(follows.followingId, target.id),
          ),
        );
      following = own !== undefined;
    }

    return c.json({
      profile: toAuthorJson(target, following),
    } satisfies ProfileResponse);
  })
  // フォロー POST /api/profiles/:username/follow
  .post("/follow", authMiddleware, async (c) => {
    const userId = c.get("userId");
    const username = c.req.param("username");

    const target = await db.query.users.findFirst({
      where: eq(users.username, username),
    });
    if (!target) {
      return c.json({ errors: { profile: ["not found"] } }, 404);
    }
    if (userId === target.id) {
      return c.json({ errors: { profile: ["cannot follow yourself"] } }, 422);
    }

    await db
      .insert(follows)
      .values({ followerId: userId, followingId: target.id })
      .onConflictDoNothing();

    return c.json({
      profile: toAuthorJson(target, true),
    } satisfies ProfileResponse);
  })
  // フォロー解除 DELETE /api/profiles/:username/follow
  .delete("/follow", authMiddleware, async (c) => {
    const userId = c.get("userId");
    const username = c.req.param("username");

    const target = await db.query.users.findFirst({
      where: eq(users.username, username),
    });
    if (!target) {
      return c.json({ errors: { profile: ["not found"] } }, 404);
    }

    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, userId),
          eq(follows.followingId, target.id),
        ),
      );

    return c.json({
      profile: toAuthorJson(target, false),
    } satisfies ProfileResponse);
  });

export default app;
