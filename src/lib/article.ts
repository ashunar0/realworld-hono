import type { Article, User } from "../db/schema";
import type { ArticleResponse } from "../schemas/article";

export function toArticleJson(
  article: Article,
  author: User,
): ArticleResponse["article"] {
  return {
    slug: article.slug,
    title: article.title,
    description: article.description,
    body: article.body,
    tagList: [],
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    favorited: false,
    favoritesCount: 0,
    author: {
      username: author.username,
      bio: author.bio,
      image: author.image,
      following: false,
    },
  };
}
