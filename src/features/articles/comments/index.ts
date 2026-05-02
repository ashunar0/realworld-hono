import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { articles, comments } from "../../../db/schema";
import {
  createCommentSchema,
  type CommentResponse,
  type CommentsResponse,
} from "../../../schemas/comment";
import { authMiddleware, type AuthVariables } from "../../../middleware/auth";
import { validateJson } from "../../../middleware/validator";
import { toCommentJson } from "../../../lib/comment";

const app = new Hono<{ Variables: AuthVariables }>()
  .basePath("/articles/:slug/comments")
  // コメント投稿 POST /api/articles/:slug/comments
  .post("/", authMiddleware, validateJson(createCommentSchema), async (c) => {
    const userId = c.get("userId");
    const slug = c.req.param("slug");
    const { comment: input } = c.req.valid("json");

    const article = await db.query.articles.findFirst({
      where: eq(articles.slug, slug),
    });
    if (!article) {
      return c.json({ errors: { body: ["article not found"] } }, 404);
    }

    const [created] = await db
      .insert(comments)
      .values({
        body: input.body,
        articleId: article.id,
        authorId: userId,
      })
      .returning();
    if (!created) throw new Error("failed to create comment");

    const createdWithAuthor = await db.query.comments.findFirst({
      where: eq(comments.id, created.id),
      with: { author: true },
    });
    if (!createdWithAuthor) throw new Error("comment not found after create");

    return c.json({
      comment: toCommentJson(createdWithAuthor, createdWithAuthor.author),
    } satisfies CommentResponse);
  })
  // コメント一覧 GET /api/articles/:slug/comments
  .get("/", async (c) => {
    const slug = c.req.param("slug");

    const article = await db.query.articles.findFirst({
      where: eq(articles.slug, slug),
    });
    if (!article) {
      return c.json({ errors: { body: ["article not found"] } }, 404);
    }

    const list = await db.query.comments.findMany({
      where: eq(comments.articleId, article.id),
      with: { author: true },
      orderBy: desc(comments.createdAt),
    });

    return c.json({
      comments: list.map((comment) => toCommentJson(comment, comment.author)),
    } satisfies CommentsResponse);
  })
  // コメント削除 DELETE /api/articles/:slug/comments/:id
  .delete("/:id", authMiddleware, async (c) => {
    const userId = c.get("userId");
    const slug = c.req.param("slug");
    const idParam = c.req.param("id");
    const commentId = Number(idParam);
    if (!Number.isInteger(commentId)) {
      return c.json({ errors: { body: ["invalid comment id"] } }, 422);
    }

    const article = await db.query.articles.findFirst({
      where: eq(articles.slug, slug),
    });
    if (!article) {
      return c.json({ errors: { body: ["article not found"] } }, 404);
    }

    const [existing] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId));
    if (!existing) {
      return c.json({ errors: { body: ["comment not found"] } }, 404);
    }

    if (existing.articleId !== article.id) {
      return c.json({ errors: { body: ["comment not found"] } }, 404);
    }

    if (existing.authorId !== userId) {
      return c.json({ errors: { body: ["forbidden"] } }, 403);
    }

    await db.delete(comments).where(eq(comments.id, existing.id));

    return c.body(null, 204);
  });

export default app;
