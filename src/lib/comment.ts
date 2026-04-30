import type { Comment, User } from "../db/schema";
import type { CommentResponse } from "../schemas/comment";

export function toCommentJson(
  comment: Comment,
  author: User,
): CommentResponse["comment"] {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: {
      username: author.username,
      bio: author.bio,
      image: author.image,
      following: false,
    },
  };
}
