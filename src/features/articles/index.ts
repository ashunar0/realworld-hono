import { Hono } from "hono";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  articleTags,
  articles,
  favorites,
  follows,
  tags,
  users,
} from "../../db/schema";
import {
  articlesQuerySchema,
  createArticleSchema,
  feedQuerySchema,
  updateArticleSchema,
  type ArticleResponse,
  type ArticlesResponse,
} from "../../schemas/article";
import {
  authMiddleware,
  optionalAuthMiddleware,
  type AuthVariables,
} from "../../middleware/auth";
import { validateJson, validateQuery } from "../../middleware/validator";
import { generateSlug } from "../../lib/slug";
import { toArticleJson, toArticleListJson } from "../../lib/article";
import comments from "./comments";
import { articleRepo } from "./repository";
import { getArticleBySlug } from "./service";

const app = new Hono<{ Variables: AuthVariables }>()
  // 記事一覧 GET /api/articles
  .get(
    "/articles",
    optionalAuthMiddleware,
    validateQuery(articlesQuerySchema),
    async (c) => {
      const { limit, offset, author, tag, favorited } = c.req.valid("query");
      const userId = c.get("userId");

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

      if (tag !== undefined) {
        const [t] = await db
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.name, tag));
        if (!t) {
          return c.json({
            articles: [],
            articlesCount: 0,
          } satisfies ArticlesResponse);
        }
        const ats = await db
          .select({ articleId: articleTags.articleId })
          .from(articleTags)
          .where(eq(articleTags.tagId, t.id));
        if (ats.length === 0) {
          return c.json({
            articles: [],
            articlesCount: 0,
          } satisfies ArticlesResponse);
        }
        conditions.push(
          inArray(
            articles.id,
            ats.map((at) => at.articleId),
          ),
        );
      }

      if (favorited !== undefined) {
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, favorited));
        if (!u) {
          return c.json({
            articles: [],
            articlesCount: 0,
          } satisfies ArticlesResponse);
        }
        const favs = await db
          .select({ articleId: favorites.articleId })
          .from(favorites)
          .where(eq(favorites.userId, u.id));
        if (favs.length === 0) {
          return c.json({
            articles: [],
            articlesCount: 0,
          } satisfies ArticlesResponse);
        }
        conditions.push(
          inArray(
            articles.id,
            favs.map((f) => f.articleId),
          ),
        );
      }

      const whereClause = conditions.length ? and(...conditions) : undefined;

      const list = await db.query.articles.findMany({
        where: whereClause,
        with: {
          author: { with: { followers: true } },
          articleTags: { with: { tag: true } },
          favoritedBy: true,
        },
        limit,
        offset,
        orderBy: [desc(articles.createdAt), desc(articles.id)],
      });

      const [totalRow] = await db
        .select({ total: count() })
        .from(articles)
        .where(whereClause);

      return c.json({
        articles: list.map((a) =>
          toArticleListJson(
            a,
            a.author,
            a.articleTags.map((at) => at.tag.name),
            userId !== undefined &&
              a.favoritedBy.some((f) => f.userId === userId),
            a.favoritedBy.length,
            userId !== undefined &&
              a.author.followers.some((f) => f.followerId === userId),
          ),
        ),
        articlesCount: totalRow?.total ?? 0,
      } satisfies ArticlesResponse);
    },
  )
  // 自分の feed GET /api/articles/feed
  .get(
    "/articles/feed",
    authMiddleware,
    validateQuery(feedQuerySchema),
    async (c) => {
      const userId = c.get("userId");
      const { limit, offset } = c.req.valid("query");

      const followingRows = await db
        .select({ id: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, userId));

      if (followingRows.length === 0) {
        return c.json({
          articles: [],
          articlesCount: 0,
        } satisfies ArticlesResponse);
      }

      const followingIds = followingRows.map((r) => r.id);

      const list = await db.query.articles.findMany({
        where: inArray(articles.authorId, followingIds),
        with: {
          author: { with: { followers: true } },
          articleTags: { with: { tag: true } },
          favoritedBy: true,
        },
        limit,
        offset,
        orderBy: [desc(articles.createdAt), desc(articles.id)],
      });

      const [totalRow] = await db
        .select({ total: count() })
        .from(articles)
        .where(inArray(articles.authorId, followingIds));

      return c.json({
        articles: list.map((a) =>
          toArticleListJson(
            a,
            a.author,
            a.articleTags.map((at) => at.tag.name),
            a.favoritedBy.some((f) => f.userId === userId),
            a.favoritedBy.length,
            true,
          ),
        ),
        articlesCount: totalRow?.total ?? 0,
      } satisfies ArticlesResponse);
    },
  )
  // 記事更新 PUT /api/articles/:slug
  .put(
    "/articles/:slug",
    authMiddleware,
    validateJson(updateArticleSchema),
    async (c) => {
      // 入力値を取得
      const userId = c.get("userId");
      const slug = c.req.param("slug");
      const { article: input } = c.req.valid("json");

      // 記事データを取得
      const existing = await articleRepo.findBySlugWithRelations(slug);
      // 記事が存在しない場合はエラーを返す
      if (!existing) {
        return c.json({ errors: { article: ["not found"] } }, 404);
      }
      // 記事の作者がログイン中のユーザーではない場合はエラーを返す
      if (existing.authorId !== userId) {
        return c.json({ errors: { article: ["forbidden"] } }, 403);
      }

      // 記事を更新
      const updated = await articleRepo.update(existing.id, input);

      // タグリストを更新
      let resultTagList: string[];
      if (input.tagList !== undefined) {
        const tagList = [...new Set(input.tagList)];
        await articleRepo.replaceArticleTags(existing.id, tagList);
        resultTagList = tagList;
      } else {
        resultTagList = existing.articleTags.map((at) => at.tag.name);
      }

      // 記事データを返す
      return c.json({
        article: toArticleJson(updated, existing.author, resultTagList),
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
      return c.json({ errors: { article: ["not found"] } }, 404);
    }
    if (existing.authorId !== userId) {
      return c.json({ errors: { article: ["forbidden"] } }, 403);
    }

    await db.delete(articles).where(eq(articles.id, existing.id));

    return c.body(null, 204);
  })
  // 記事取得 GET /api/articles/:slug
  .get("/articles/:slug", optionalAuthMiddleware, async (c) => {
    // 入力値を取得
    const slug = c.req.param("slug");
    const userId = c.get("userId");

    // 記事データを取得
    const result = await getArticleBySlug(slug, userId);

    // 記事が存在しない場合はエラーを返す
    if (result.kind === "not_found") {
      return c.json({ errors: { article: ["not found"] } }, 404);
    }

    // 記事データを返す
    return c.json({ article: result.article } satisfies ArticleResponse);
  })
  // 記事作成 POST /api/articles
  .post(
    "/articles",
    authMiddleware,
    validateJson(createArticleSchema),
    async (c) => {
      // 入力値を取得
      const userId = c.get("userId");
      const { article: input } = c.req.valid("json");

      // 記事のスラグを生成
      const slug = generateSlug(input.title);
      const tagList = [...new Set(input.tagList ?? [])];

      // 現在時刻を取得
      const now = new Date().toISOString();

      // 記事を作成
      const [created] = await db
        .insert(articles)
        .values({
          slug,
          title: input.title,
          description: input.description,
          body: input.body,
          authorId: userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created) throw new Error("failed to create article");

      // タグを作成
      if (tagList.length > 0) {
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
          .values(tagRows.map((t) => ({ articleId: created.id, tagId: t.id })));
      }

      // 作者データを取得
      const [author] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      if (!author) throw new Error("author not found");

      // 記事データを返す
      return c.json(
        {
          article: toArticleJson(created, author, tagList),
        } satisfies ArticleResponse,
        201,
      );
    },
  )
  // 記事 favorite POST /api/articles/:slug/favorite
  .post("/articles/:slug/favorite", authMiddleware, async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const slug = c.req.param("slug");

    // 記事データを取得
    const article = await articleRepo.findBySlugWithRelations(slug);
    if (!article) {
      return c.json({ errors: { article: ["not found"] } }, 404);
    }

    // 記事をいいねする
    await db
      .insert(favorites)
      .values({ userId, articleId: article.id })
      .onConflictDoNothing();

    // 記事のいいね数を取得
    const [countRow] = await db
      .select({ total: count() })
      .from(favorites)
      .where(eq(favorites.articleId, article.id));

    // 記事データを返す
    return c.json({
      article: toArticleJson(
        article,
        article.author,
        article.articleTags.map((at) => at.tag.name),
        true,
        countRow?.total ?? 0,
        article.author.followers.some((f) => f.followerId === userId),
      ),
    } satisfies ArticleResponse);
  })
  // 記事 favorite 解除 DELETE /api/articles/:slug/favorite
  .delete("/articles/:slug/favorite", authMiddleware, async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const slug = c.req.param("slug");

    // 記事データを取得
    const article = await articleRepo.findBySlugWithRelations(slug);
    if (!article) {
      return c.json({ errors: { article: ["not found"] } }, 404);
    }

    // 記事のいいねを解除
    await db
      .delete(favorites)
      .where(
        and(eq(favorites.userId, userId), eq(favorites.articleId, article.id)),
      );

    // 記事のいいね数を取得
    const [countRow] = await db
      .select({ total: count() })
      .from(favorites)
      .where(eq(favorites.articleId, article.id));

    // 記事データを返す
    return c.json({
      article: toArticleJson(
        article,
        article.author,
        article.articleTags.map((at) => at.tag.name),
        false,
        countRow?.total ?? 0,
        article.author.followers.some((f) => f.followerId === userId),
      ),
    } satisfies ArticleResponse);
  })
  // コメント sub-app をネストマウント（prefix は子の basePath 側で持つ）
  .route("/", comments);

export default app;
