import { and, count, eq } from "drizzle-orm";
import { db } from "../../db";
import { articles, favorites } from "../../db/schema";

export const articleRepo = {
  // 記事詳細表示に必要な author（+ followers）と articleTags（+ tag）を eager load
  findBySlugWithRelations(slug: string) {
    return db.query.articles.findFirst({
      where: eq(articles.slug, slug),
      with: {
        author: { with: { followers: true } },
        articleTags: { with: { tag: true } },
      },
    });
  },

  // favorite 総数。row 形式は隠蔽して number で返す
  async countFavorites(articleId: number) {
    const [row] = await db
      .select({ total: count() })
      .from(favorites)
      .where(eq(favorites.articleId, articleId));
    return row?.total ?? 0;
  },

  // 指定 user が指定記事を favorite してるか。boolean に潰す
  async isFavoritedBy(articleId: number, userId: number) {
    const [row] = await db
      .select()
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.articleId, articleId),
        ),
      );
    return row !== undefined;
  },
};
