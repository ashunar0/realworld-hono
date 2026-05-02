import type { Article, User } from "../db/schema";
import type { ArticleResponse } from "../schemas/article";

export function toArticleJson(
  article: Article,
  author: User,
  tagList: string[] = [],
  favorited: boolean = false,
  favoritesCount: number = 0,
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
    author: {
      username: author.username,
      bio: author.bio,
      image: author.image,
      following: false,
    },
  };
}
