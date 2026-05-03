import { Hono } from "hono";
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
import comments from "./comments";
import {
  createArticle,
  deleteArticle,
  favoriteArticle,
  feedArticles,
  getArticleBySlug,
  listArticles,
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
      // 入力値を取得
      const filter = c.req.valid("query");
      const userId = c.get("userId");

      // 記事一覧を取得
      const result = await listArticles(filter, userId);

      // 記事データを返す
      return c.json(result satisfies ArticlesResponse);
    },
  )
  // 自分の feed GET /api/articles/feed
  .get(
    "/articles/feed",
    authMiddleware,
    validateQuery(feedQuerySchema),
    async (c) => {
      // 入力値を取得
      const userId = c.get("userId");
      const filter = c.req.valid("query");

      // 自分の feed を取得
      const result = await feedArticles(userId, filter);

      // 記事データを返す
      return c.json(result satisfies ArticlesResponse);
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
      return c.json({ article: result.article } satisfies ArticleResponse, 201);
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
