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
