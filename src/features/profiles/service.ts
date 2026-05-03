import { isFollowing, toAuthorJson } from "../../lib/author";
import { userRepo } from "../users/repository";

// プロフィール取得の orchestration。
// 戻り値は tagged union: { kind: "ok", profile } | { kind: "not_found" }
export async function getProfile(
  username: string,
  viewerId: number | undefined,
) {
  // 対象ユーザーを取得
  const target = await userRepo.findByUsernameWithFollowers(username);
  if (!target) return { kind: "not_found" as const };

  // 自身がフォローしているかを判定
  const following = isFollowing(target, viewerId);

  return {
    kind: "ok" as const,
    profile: toAuthorJson(target, following),
  };
}

// フォロー作成の orchestration。
// 戻り値は tagged union:
//   { kind: "ok", profile } | { kind: "not_found" } | { kind: "cannot_follow_yourself" }
export async function followUser(username: string, viewerId: number) {
  // 対象ユーザーを取得
  const target = await userRepo.findByUsername(username);
  if (!target) return { kind: "not_found" as const };
  // 自分自身は不可
  if (viewerId === target.id) {
    return { kind: "cannot_follow_yourself" as const };
  }

  // フォロー関係を作成
  await userRepo.createFollow(viewerId, target.id);

  return {
    kind: "ok" as const,
    profile: toAuthorJson(target, true),
  };
}

// フォロー解除の orchestration。
// 戻り値は tagged union: { kind: "ok", profile } | { kind: "not_found" }
export async function unfollowUser(username: string, viewerId: number) {
  // 対象ユーザーを取得
  const target = await userRepo.findByUsername(username);
  if (!target) return { kind: "not_found" as const };

  // フォロー関係を削除
  await userRepo.deleteFollow(viewerId, target.id);

  return {
    kind: "ok" as const,
    profile: toAuthorJson(target, false),
  };
}
