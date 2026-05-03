import type { User } from "../../db/schema";
import type { AuthUserResponse } from "../../schemas/user";

export function toAuthUserJson(
  user: User,
  token: string,
): AuthUserResponse["user"] {
  return {
    email: user.email,
    token,
    username: user.username,
    bio: user.bio,
    image: user.image,
  };
}
