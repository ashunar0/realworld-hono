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
import { toArticleListJson } from "../../lib/article";
import comments from "./comments";
import { userRepo } from "../users/repository";
import { articleRepo } from "./repository";
import {
  createArticle,
  deleteArticle,
  favoriteArticle,
  getArticleBySlug,
  unfavoriteArticle,
  updateArticle,
} from "./service";

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

      // 記事を更新
      const result = await updateArticle(slug, userId, input);

      // 各エラーケースに status code をマッピング
      if (result.kind === "not_found") {
        return c.json({ errors: { article: ["not found"] } }, 404);
      }
      if (result.kind === "forbidden") {
        return c.json({ errors: { article: ["forbidden"] } }, 403);
      }

      // 記事データを返す
      return c.json({ article: result.article } satisfies ArticleResponse);
    },
  )
  // 記事削除 DELETE /api/articles/:slug
  .delete("/articles/:slug", authMiddleware, async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const slug = c.req.param("slug");

    // 記事を削除
    const result = await deleteArticle(slug, userId);

    // 各エラーケースに status code をマッピング
    if (result.kind === "not_found") {
      return c.json({ errors: { article: ["not found"] } }, 404);
    }
    if (result.kind === "forbidden") {
      return c.json({ errors: { article: ["forbidden"] } }, 403);
    }

    // 削除成功
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

      // 記事を作成
      const result = await createArticle(userId, input);

      // 記事データを返す
      return c.json(
        { article: result.article } satisfies ArticleResponse,
        201,
      );
    },
  )
  // 記事 favorite POST /api/articles/:slug/favorite
  .post("/articles/:slug/favorite", authMiddleware, async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const slug = c.req.param("slug");

    // いいねを追加
    const result = await favoriteArticle(slug, userId);

    // 各エラーケースに status code をマッピング
    if (result.kind === "not_found") {
      return c.json({ errors: { article: ["not found"] } }, 404);
    }

    // 記事データを返す
    return c.json({ article: result.article } satisfies ArticleResponse);
  })
  // 記事 favorite 解除 DELETE /api/articles/:slug/favorite
  .delete("/articles/:slug/favorite", authMiddleware, async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const slug = c.req.param("slug");

    // いいねを解除
    const result = await unfavoriteArticle(slug, userId);

    // 各エラーケースに status code をマッピング
    if (result.kind === "not_found") {
      return c.json({ errors: { article: ["not found"] } }, 404);
    }

    // 記事データを返す
    return c.json({ article: result.article } satisfies ArticleResponse);
  })
  // コメント sub-app をネストマウント（prefix は子の basePath 側で持つ）
  .route("/", comments);

export default app;
