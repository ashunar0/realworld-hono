import { signToken } from "../../lib/jwt";
import { toAuthUserJson } from "../../lib/user";
import type {
  CreateUserRequest,
  LoginUserRequest,
  UpdateUserRequest,
} from "../../schemas/user";
import { userRepo } from "./repository";

// PUT /user で bio / image に空文字を渡された場合は null として保存する
const normalizeNullable = (
  v: string | null | undefined,
): string | null | undefined => (v === "" ? null : v);

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

// 現在ユーザー取得の orchestration。
// 戻り値は tagged union: { kind: "ok", user } | { kind: "not_found" }
export async function getCurrentUser(viewerId: number) {
  // ユーザーを取得
  const found = await userRepo.findById(viewerId);
  if (!found) return { kind: "not_found" as const };

  // トークンを生成
  const token = await signToken(found.id);

  return {
    kind: "ok" as const,
    user: toAuthUserJson(found, token),
  };
}

// 現在ユーザー更新の orchestration。
// 戻り値は tagged union:
//   { kind: "ok", user }
//   | { kind: "not_found" }
//   | { kind: "email_taken" }
//   | { kind: "username_taken" }
export async function updateUser(
  viewerId: number,
  input: UpdateUserRequest["user"],
) {
  // メール重複確認（自分以外）
  if (input.email !== undefined) {
    if (await userRepo.findByEmailExcludingId(input.email, viewerId)) {
      return { kind: "email_taken" as const };
    }
  }
  // ユーザー名重複確認（自分以外）
  if (input.username !== undefined) {
    if (await userRepo.findByUsernameExcludingId(input.username, viewerId)) {
      return { kind: "username_taken" as const };
    }
  }

  // パスワードをハッシュ化
  const passwordHash =
    input.password !== undefined
      ? await Bun.password.hash(input.password)
      : undefined;

  // bio / image は空文字を null に正規化
  const bio = normalizeNullable(input.bio);
  const image = normalizeNullable(input.image);

  // ユーザー情報を更新
  const updated = await userRepo.update(viewerId, {
    email: input.email,
    username: input.username,
    passwordHash,
    bio,
    image,
  });
  if (!updated) return { kind: "not_found" as const };

  // トークンを生成
  const token = await signToken(updated.id);

  return {
    kind: "ok" as const,
    user: toAuthUserJson(updated, token),
  };
}
