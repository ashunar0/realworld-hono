import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { articleTags, articles, favorites, tags } from "../../db/schema";

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

  // 部分更新。渡された field のみ反映、updatedAt は常に ISO で更新
  async update(
    id: number,
    fields: { title?: string; description?: string; body?: string },
  ) {
    const [row] = await db
      .update(articles)
      .set({
        ...(fields.title !== undefined && { title: fields.title }),
        ...(fields.description !== undefined && {
          description: fields.description,
        }),
        ...(fields.body !== undefined && { body: fields.body }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(articles.id, id))
      .returning();
    if (!row) throw new Error("failed to update article");
    return row;
  },

  // 記事を新規作成。createdAt/updatedAt は内部で ISO 生成
  async create(fields: {
    slug: string;
    title: string;
    description: string;
    body: string;
    authorId: number;
  }) {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(articles)
      .values({ ...fields, createdAt: now, updatedAt: now })
      .returning();
    if (!row) throw new Error("failed to create article");
    return row;
  },

  // tags を全置換。delete → upsert（onConflictDoNothing）→ link を集約
  async replaceArticleTags(articleId: number, tagList: string[]) {
    await db.delete(articleTags).where(eq(articleTags.articleId, articleId));
    if (tagList.length === 0) return;

    await db
      .insert(tags)
      .values(tagList.map((name) => ({ name })))
      .onConflictDoNothing();
    const tagRows = await db
      .select()
      .from(tags)
      .where(inArray(tags.name, tagList));
    await db
      .insert(articleTags)
      .values(tagRows.map((t) => ({ articleId, tagId: t.id })));
  },
};
