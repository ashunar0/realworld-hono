import type { Article, User } from "../db/schema";
import type { ArticleListItem, ArticleResponse } from "../schemas/article";
import { toAuthorJson } from "./author";

const toIso = (s: string): string =>
  new Date(s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z")).toISOString();

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
    createdAt: toIso(article.createdAt),
    updatedAt: toIso(article.updatedAt),
    favorited,
    favoritesCount,
    author: toAuthorJson(author, following),
  };
}

export function toArticleListJson(
  ...args: Parameters<typeof toArticleJson>
): ArticleListItem {
  const { body, ...rest } = toArticleJson(...args);
  return rest;
}
