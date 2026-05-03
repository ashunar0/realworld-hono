import { signToken } from "../../lib/jwt";
import { toAuthUserJson } from "../../lib/user";
import type {
  CreateUserRequest,
  LoginUserRequest,
} from "../../schemas/user";
import { userRepo } from "./repository";

// 新規登録の orchestration。
// 戻り値は tagged union:
//   { kind: "ok", user } | { kind: "email_taken" } | { kind: "username_taken" }
export async function signupUser(input: CreateUserRequest["user"]) {
  // メール重複確認
  if (await userRepo.findByEmail(input.email)) {
    return { kind: "email_taken" as const };
  }
  // ユーザー名重複確認
  if (await userRepo.findByUsername(input.username)) {
    return { kind: "username_taken" as const };
  }

  // パスワードをハッシュ化
  const passwordHash = await Bun.password.hash(input.password);

  // ユーザーを作成
  const created = await userRepo.create({
    username: input.username,
    email: input.email,
    passwordHash,
  });

  // トークンを生成
  const token = await signToken(created.id);

  return {
    kind: "ok" as const,
    user: toAuthUserJson(created, token),
  };
}

// ログインの orchestration。
// 戻り値は tagged union: { kind: "ok", user } | { kind: "invalid_credentials" }
export async function loginUser(input: LoginUserRequest["user"]) {
  // ユーザーを取得
  const found = await userRepo.findByEmail(input.email);
  if (!found) return { kind: "invalid_credentials" as const };

  // パスワードを検証
  const ok = await Bun.password.verify(input.password, found.passwordHash);
  if (!ok) return { kind: "invalid_credentials" as const };

  // トークンを生成
  const token = await signToken(found.id);

  return {
    kind: "ok" as const,
    user: toAuthUserJson(found, token),
  };
}
