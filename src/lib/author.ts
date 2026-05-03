import type { User } from "../db/schema";
import type { Profile } from "../schemas/profile";

export function toAuthorJson(
  author: Pick<User, "username" | "bio" | "image">,
  following: boolean,
): Profile {
  return {
    username: author.username,
    bio: author.bio,
    image: author.image,
    following,
  };
}

// viewer が user を follow しているか。eager load 済み followers から in-memory 判定。
// viewerId が undefined（未ログイン）なら常に false。
export function isFollowing(
  user: { followers: { followerId: number }[] },
  viewerId: number | undefined,
): boolean {
  return (
    viewerId !== undefined &&
    user.followers.some((f) => f.followerId === viewerId)
  );
}
