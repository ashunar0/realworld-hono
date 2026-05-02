import { z } from "zod";

export const createArticleSchema = z.object({
  article: z.object({
    title: z.string().min(1, "can't be empty"),
    description: z.string().min(1, "can't be empty"),
    body: z.string().min(1, "can't be empty"),
    tagList: z.array(z.string()).optional(),
  }),
});

export type CreateArticleRequest = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = z.object({
  article: z.object({
    title: z.string().min(1, "can't be empty").optional(),
    description: z.string().min(1, "can't be empty").optional(),
    body: z.string().min(1, "can't be empty").optional(),
    tagList: z.array(z.string()).optional(),
  }),
});

export type UpdateArticleRequest = z.infer<typeof updateArticleSchema>;

export const articlesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  author: z.string().optional(),
  tag: z.string().optional(),
  favorited: z.string().optional(),
});

export type ArticlesQuery = z.infer<typeof articlesQuerySchema>;

export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;

export type ArticleResponse = {
  article: {
    slug: string;
    title: string;
    description: string;
    body: string;
    tagList: string[];
    createdAt: string;
    updatedAt: string;
    favorited: boolean;
    favoritesCount: number;
    author: {
      username: string;
      bio: string | null;
      image: string | null;
      following: boolean;
    };
  };
};

export type ArticlesResponse = {
  articles: ArticleResponse["article"][];
  articlesCount: number;
};
