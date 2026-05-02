import { z } from "zod";

export const createArticleSchema = z.object({
  article: z.object({
    title: z.string().trim().min(1, "can't be blank"),
    description: z.string().trim().min(1, "can't be blank"),
    body: z.string().trim().min(1, "can't be blank"),
    tagList: z.array(z.string()).optional(),
  }),
});

export type CreateArticleRequest = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = z.object({
  article: z.object({
    title: z.string().trim().min(1, "can't be blank").optional(),
    description: z.string().trim().min(1, "can't be blank").optional(),
    body: z.string().trim().min(1, "can't be blank").optional(),
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

export type ArticleListItem = Omit<ArticleResponse["article"], "body">;

export type ArticlesResponse = {
  articles: ArticleListItem[];
  articlesCount: number;
};
