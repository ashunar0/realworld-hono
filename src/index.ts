import { Hono } from "hono";
import { sign } from "hono/jwt";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { articles, users } from "./db/schema";
import {
  createUserSchema,
  loginUserSchema,
  updateUserSchema,
  type AuthUserResponse,
} from "./schemas/user";
import {
  articlesQuerySchema,
  createArticleSchema,
  updateArticleSchema,
  type ArticleResponse,
  type ArticlesResponse,
} from "./schemas/article";
import { authMiddleware, type AuthVariables } from "./middleware/auth";
import { validateJson, validateQuery } from "./middleware/validator";
import { generateSlug } from "./lib/slug";
import { toArticleJson } from "./lib/article";

const secret = Bun.env.JWT_SECRET ?? "dev-fallback";

const app = new Hono<{ Variables: AuthVariables }>();

app.get("/", (c) => c.text("Hello Hono!"));

// 新規登録
app.post(
  "/api/users",
  validateJson(createUserSchema),
  async (c) => {
    const { username, email, password } = c.req.valid("json").user;
    const passwordHash = await Bun.password.hash(password);

    const [row] = await db
      .insert(users)
      .values({ username, email, passwordHash })
      .returning();
    if (!row) throw new Error("failed to insert user");

    const token = await sign(
      {
        sub: String(row.id),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      secret,
      "HS256",
    );

    return c.json({
      user: {
        email: row.email,
        token,
        username: row.username,
        bio: row.bio,
        image: row.image,
      },
    } satisfies AuthUserResponse);
  },
);

// ログイン
app.post(
  "/api/users/login",
  validateJson(loginUserSchema),
  async (c) => {
    const { email, password } = c.req.valid("json").user;

    const fail = () =>
      c.json({ errors: { body: ["email or password is invalid"] } }, 422);

    const [row] = await db.select().from(users).where(eq(users.email, email));
    if (!row) return fail();

    const ok = await Bun.password.verify(password, row.passwordHash);
    if (!ok) return fail();

    const token = await sign(
      {
        sub: String(row.id),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      secret,
      "HS256",
    );

    return c.json({
      user: {
        email: row.email,
        token,
        username: row.username,
        bio: row.bio,
        image: row.image,
      },
    } satisfies AuthUserResponse);
  },
);

// ユーザー情報取得
app.get("/api/user", authMiddleware, async (c) => {
  const userId = c.get("userId");

  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) return c.json({ errors: { body: ["user not found"] } }, 404);

  const token = await sign(
    {
      sub: String(row.id),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    },
    secret,
    "HS256",
  );

  return c.json({
    user: {
      email: row.email,
      token,
      username: row.username,
      bio: row.bio,
      image: row.image,
    },
  } satisfies AuthUserResponse);
});

// ユーザー情報更新
app.put(
  "/api/user",
  authMiddleware,
  validateJson(updateUserSchema),
  async (c) => {
    const userId = c.get("userId");
    const { user } = c.req.valid("json");

    const passwordHash = user.password !== undefined
      ? await Bun.password.hash(user.password)
      : undefined;

    const [row] = await db
      .update(users)
      .set({
        ...(user.email !== undefined && { email: user.email }),
        ...(user.username !== undefined && { username: user.username }),
        ...(passwordHash !== undefined && { passwordHash }),
        ...(user.bio !== undefined && { bio: user.bio }),
        ...(user.image !== undefined && { image: user.image }),
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(users.id, userId))
      .returning();

    if (!row) return c.json({ errors: { body: ["user not found"] } }, 404);

    const token = await sign(
      {
        sub: String(row.id),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      },
      secret,
      "HS256",
    );

    return c.json({
      user: {
        email: row.email,
        token,
        username: row.username,
        bio: row.bio,
        image: row.image,
      },
    } satisfies AuthUserResponse);
  },
);

// 記事一覧
app.get(
  "/api/articles",
  validateQuery(articlesQuerySchema),
  async (c) => {
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
  },
);

// 記事更新
app.put(
  "/api/articles/:slug",
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
);

// 記事削除
app.delete("/api/articles/:slug", authMiddleware, async (c) => {
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
});

// 記事取得
app.get("/api/articles/:slug", async (c) => {
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
});

// 記事作成
app.post(
  "/api/articles",
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
);

export default app;
