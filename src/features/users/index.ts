import { Hono } from "hono";
import {
  createUserSchema,
  loginUserSchema,
  updateUserSchema,
  type AuthUserResponse,
} from "../../schemas/user";
import { authMiddleware, type AuthVariables } from "../../middleware/auth";
import { validateJson } from "../../middleware/validator";
import {
  getCurrentUser,
  loginUser,
  signupUser,
  updateUser,
} from "./service";

const app = new Hono<{ Variables: AuthVariables }>()
  // 新規登録 POST /api/users
  .post("/users", validateJson(createUserSchema), async (c) => {
    // 入力値を取得
    const input = c.req.valid("json").user;

    // ユーザーを作成
    const result = await signupUser(input);

    // 各エラーケースに status code をマッピング
    if (result.kind === "email_taken") {
      return c.json({ errors: { email: ["has already been taken"] } }, 409);
    }
    if (result.kind === "username_taken") {
      return c.json({ errors: { username: ["has already been taken"] } }, 409);
    }

    // 登録成功
    return c.json({ user: result.user } satisfies AuthUserResponse, 201);
  })
  // ログイン POST /api/users/login
  .post("/users/login", validateJson(loginUserSchema), async (c) => {
    // 入力値を取得
    const input = c.req.valid("json").user;

    // ログイン
    const result = await loginUser(input);

    // 各エラーケースに status code をマッピング
    if (result.kind === "invalid_credentials") {
      return c.json({ errors: { credentials: ["invalid"] } }, 401);
    }

    // ログイン成功
    return c.json({ user: result.user } satisfies AuthUserResponse);
  })
  // ユーザー情報取得 GET /api/user
  .get("/user", authMiddleware, async (c) => {
    // 入力値を取得
    const userId = c.get("userId");

    // ユーザー情報を取得
    const result = await getCurrentUser(userId);

    // 各エラーケースに status code をマッピング
    if (result.kind === "not_found") {
      return c.json({ errors: { user: ["not found"] } }, 404);
    }

    // ユーザー情報を返す
    return c.json({ user: result.user } satisfies AuthUserResponse);
  })
  // ユーザー情報更新 PUT /api/user
  .put("/user", authMiddleware, validateJson(updateUserSchema), async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const input = c.req.valid("json").user;

    // ユーザー情報を更新
    const result = await updateUser(userId, input);

    // 各エラーケースに status code をマッピング
    if (result.kind === "not_found") {
      return c.json({ errors: { user: ["not found"] } }, 404);
    }
    if (result.kind === "email_taken") {
      return c.json({ errors: { email: ["has already been taken"] } }, 409);
    }
    if (result.kind === "username_taken") {
      return c.json({ errors: { username: ["has already been taken"] } }, 409);
    }

    // 更新成功
    return c.json({ user: result.user } satisfies AuthUserResponse);
  });

export default app;
