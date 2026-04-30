import { z } from "zod";

export const createUserSchema = z.object({
  user: z.object({
    username: z.string().min(1, "can't be empty"),
    email: z.string().email("must be a valid email"),
    password: z.string().min(8, "must be at least 8 characters"),
  }),
});

export type CreateUserRequest = z.infer<typeof createUserSchema>;

export const loginUserSchema = z.object({
  user: z.object({
    email: z.string().email("must be a valid email"),
    password: z.string().min(1, "can't be empty"),
  }),
});

export type LoginUserRequest = z.infer<typeof loginUserSchema>;

export type UserRow = {
  id: number;
  username: string;
  email: string;
  bio: string | null;
  image: string | null;
};

export type AuthUserResponse = {
  user: {
    email: string;
    token: string;
    username: string;
    bio: string | null;
    image: string | null;
  };
};
