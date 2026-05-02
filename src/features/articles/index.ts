import { Hono } from "hono";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { articles, users } from "../../db/schema";
import {
  articlesQuerySchema,
  createArticleSchema,
  updateArticleSchema,
  type ArticleResponse,
  type ArticlesResponse,
} from "../../schemas/article";
import { authMiddleware, type AuthVariables } from "../../middleware/auth";
import { validateJson, validateQuery } from "../../middleware/validator";
import { generateSlug } from "../../lib/slug";
import { toArticleJson } from "../../lib/article";
import comments from "./comments";

const app = new Hono<{ Variables: AuthVariables }>()
  // 記事一覧 GET /api/articles
  .get("/articles", validateQuery(articlesQuerySchema), async (c) => {
    const { limit, offset, author } = c.req.valid("query");

    const conditions = [];
    if (author !== undefined) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, author));
      if (!u) {
        return c.json({
          articles: [],
          articlesCount: 0,
        } satisfies ArticlesResponse);
      }
      conditions.push(eq(articles.authorId, u.id));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const list = await db.query.articles.findMany({
      where: whereClause,
      with: { author: true },
      limit,
      offset,
      orderBy: desc(articles.createdAt),
    });

    const [totalRow] = await db
      .select({ total: count() })
      .from(articles)
      .where(whereClause);

    return c.json({
      articles: list.map((a) => toArticleJson(a, a.author)),
      articlesCount: totalRow?.total ?? 0,
    } satisfies ArticlesResponse);
  })
  // 記事更新 PUT /api/articles/:slug
  .put(
    "/articles/:slug",
    authMiddleware,
    validateJson(updateArticleSchema),
    async (c) => {
      const userId = c.get("userId");
      const slug = c.req.param("slug");
      const { article: input } = c.req.valid("json");

      const existing = await db.query.articles.findFirst({
        where: eq(articles.slug, slug),
        with: { author: true },
      });
      if (!existing) {
        return c.json({ errors: { body: ["article not found"] } }, 404);
      }
      if (existing.authorId !== userId) {
        return c.json({ errors: { body: ["forbidden"] } }, 403);
      }

      const [updated] = await db
        .update(articles)
        .set({
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.body !== undefined && { body: input.body }),
          updatedAt: sql`(datetime('now'))`,
        })
        .where(eq(articles.id, existing.id))
        .returning();
      if (!updated) throw new Error("failed to update article");

      return c.json({
        article: toArticleJson(updated, existing.author),
      } satisfies ArticleResponse);
    },
  )
  // 記事削除 DELETE /api/articles/:slug
  .delete("/articles/:slug", authMiddleware, async (c) => {
    const userId = c.get("userId");
    const slug = c.req.param("slug");

    const [existing] = await db
      .select()
      .from(articles)
      .where(eq(articles.slug, slug));
    if (!existing) {
      return c.json({ errors: { body: ["article not found"] } }, 404);
    }
    if (existing.authorId !== userId) {
      return c.json({ errors: { body: ["forbidden"] } }, 403);
    }

    await db.delete(articles).where(eq(articles.id, existing.id));

    return c.body(null, 204);
  })
  // 記事取得 GET /api/articles/:slug
  .get("/articles/:slug", async (c) => {
    const slug = c.req.param("slug");

    const article = await db.query.articles.findFirst({
      where: eq(articles.slug, slug),
      with: { author: true },
    });
    if (!article) {
      return c.json({ errors: { body: ["article not found"] } }, 404);
    }

    return c.json({
      article: toArticleJson(article, article.author),
    } satisfies ArticleResponse);
  })
  // 記事作成 POST /api/articles
  .post(
    "/articles",
    authMiddleware,
    validateJson(createArticleSchema),
    async (c) => {
      const userId = c.get("userId");
      const { article: input } = c.req.valid("json");

      const slug = generateSlug(input.title);

      const [created] = await db
        .insert(articles)
        .values({
          slug,
          title: input.title,
          description: input.description,
          body: input.body,
          authorId: userId,
        })
        .returning();
      if (!created) throw new Error("failed to create article");

      const [author] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      if (!author) throw new Error("author not found");

      return c.json({
        article: toArticleJson(created, author),
      } satisfies ArticleResponse);
    },
  )
  // コメント sub-app をネストマウント（prefix は子の basePath 側で持つ）
  .route("/", comments);

export default app;
