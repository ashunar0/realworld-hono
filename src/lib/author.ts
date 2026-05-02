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
