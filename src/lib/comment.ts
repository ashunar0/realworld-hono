import type { Comment, User } from "../db/schema";
import type { CommentResponse } from "../schemas/comment";

const toIso = (s: string): string =>
  new Date(s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z")).toISOString();

export function toCommentJson(
  comment: Comment,
  author: User,
): CommentResponse["comment"] {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: toIso(comment.createdAt),
    updatedAt: toIso(comment.updatedAt),
    author: {
      username: author.username,
      bio: author.bio,
      image: author.image,
      following: false,
    },
  };
}
