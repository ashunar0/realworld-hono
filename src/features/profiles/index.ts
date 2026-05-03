import { Hono } from "hono";
import {
  authMiddleware,
  optionalAuthMiddleware,
  type AuthVariables,
} from "../../middleware/auth";
import type { ProfileResponse } from "../../schemas/profile";
import { followUser, getProfile, unfollowUser } from "./service";

const app = new Hono<{ Variables: AuthVariables }>()
  .basePath("/profiles/:username")
  // プロフィール取得 GET /api/profiles/:username
  .get("/", optionalAuthMiddleware, async (c) => {
    // 入力値を取得
    const username = c.req.param("username");
    const userId = c.get("userId");

    // プロフィールを取得
    const result = await getProfile(username, userId);

    // 各エラーケースに status code をマッピング
    if (result.kind === "not_found") {
      return c.json({ errors: { profile: ["not found"] } }, 404);
    }

    // プロフィールデータを返す
    return c.json({ profile: result.profile } satisfies ProfileResponse);
  })
  // フォロー POST /api/profiles/:username/follow
  .post("/follow", authMiddleware, async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const username = c.req.param("username");

    // フォロー関係を作成
    const result = await followUser(username, userId);

    // 各エラーケースに status code をマッピング
    if (result.kind === "not_found") {
      return c.json({ errors: { profile: ["not found"] } }, 404);
    }
    if (result.kind === "cannot_follow_yourself") {
      return c.json({ errors: { profile: ["cannot follow yourself"] } }, 422);
    }

    // フォロー成功
    return c.json({ profile: result.profile } satisfies ProfileResponse);
  })
  // フォロー解除 DELETE /api/profiles/:username/follow
  .delete("/follow", authMiddleware, async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const username = c.req.param("username");

    // フォロー関係を削除
    const result = await unfollowUser(username, userId);

    // 各エラーケースに status code をマッピング
    if (result.kind === "not_found") {
      return c.json({ errors: { profile: ["not found"] } }, 404);
    }

    // フォロー解除成功
    return c.json({ profile: result.profile } satisfies ProfileResponse);
  });

export default app;
