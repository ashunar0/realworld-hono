import { desc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { comments } from "../../../db/schema";

export const commentRepo = {
  // 新規コメント作成。createdAt/updatedAt は内部で ISO 生成
  async create(fields: { body: string; articleId: number; authorId: number }) {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(comments)
      .values({ ...fields, createdAt: now, updatedAt: now })
      .returning();
    if (!row) throw new Error("failed to create comment");
    return row;
  },

  // 記事に紐づくコメント一覧。author を eager load + stable sort
  listByArticleId(articleId: number) {
    return db.query.comments.findMany({
      where: eq(comments.articleId, articleId),
      with: { author: true },
      orderBy: [desc(comments.createdAt), desc(comments.id)],
    });
  },

  // ID から comment を取得。存在しなければ undefined
  findById(id: number) {
    return db.query.comments.findFirst({ where: eq(comments.id, id) });
  },

  // コメント削除
  async delete(id: number) {
    await db.delete(comments).where(eq(comments.id, id));
  },
};
