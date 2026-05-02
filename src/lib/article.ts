import type { Article, User } from "../db/schema";
import type { ArticleResponse } from "../schemas/article";
import { toAuthorJson } from "./author";

export function toArticleJson(
  article: Article,
  author: User,
  tagList: string[] = [],
  favorited: boolean = false,
  favoritesCount: number = 0,
  following: boolean = false,
): ArticleResponse["article"] {
  return {
    slug: article.slug,
    title: article.title,
    description: article.description,
    body: article.body,
    tagList,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    favorited,
    favoritesCount,
    author: toAuthorJson(author, following),
  };
}
