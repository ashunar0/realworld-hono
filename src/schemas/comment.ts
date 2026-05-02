import { z } from "zod";

export const createCommentSchema = z.object({
  comment: z.object({
    body: z.string().trim().min(1, "can't be blank"),
  }),
});

export type CreateCommentRequest = z.infer<typeof createCommentSchema>;

export type CommentResponse = {
  comment: {
    id: number;
    createdAt: string;
    updatedAt: string;
    body: string;
    author: {
      username: string;
      bio: string | null;
      image: string | null;
      following: boolean;
    };
  };
};

export type CommentsResponse = {
  comments: CommentResponse["comment"][];
};
