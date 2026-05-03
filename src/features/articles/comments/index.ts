import { Hono } from "hono";
import {
  createCommentSchema,
  type CommentResponse,
  type CommentsResponse,
} from "../../../schemas/comment";
import { authMiddleware, type AuthVariables } from "../../../middleware/auth";
import { validateJson } from "../../../middleware/validator";
import { createComment, deleteComment, listComments } from "./service";

const app = new Hono<{ Variables: AuthVariables }>()
  .basePath("/articles/:slug/comments")
  // コメント投稿 POST /api/articles/:slug/comments
  .post("/", authMiddleware, validateJson(createCommentSchema), async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const slug = c.req.param("slug");
    const { comment: input } = c.req.valid("json");

    // コメントを作成
    const result = await createComment(slug, userId, input);

    // 各エラーケースに status code をマッピング
    if (result.kind === "article_not_found") {
      return c.json({ errors: { article: ["not found"] } }, 404);
    }

    // 投稿成功
    return c.json({ comment: result.comment } satisfies CommentResponse, 201);
  })
  // コメント一覧 GET /api/articles/:slug/comments
  .get("/", async (c) => {
    // 入力値を取得
    const slug = c.req.param("slug");

    // コメント一覧を取得
    const result = await listComments(slug);

    // 各エラーケースに status code をマッピング
    if (result.kind === "article_not_found") {
      return c.json({ errors: { article: ["not found"] } }, 404);
    }

    // 一覧を返す
    return c.json({ comments: result.comments } satisfies CommentsResponse);
  })
  // コメント削除 DELETE /api/articles/:slug/comments/:id
  .delete("/:id", authMiddleware, async (c) => {
    // 入力値を取得
    const userId = c.get("userId");
    const slug = c.req.param("slug");
    const idParam = c.req.param("id");
    const commentId = Number(idParam);
    if (!Number.isInteger(commentId)) {
      return c.json({ errors: { id: ["invalid"] } }, 422);
    }

    // コメントを削除
    const result = await deleteComment(slug, commentId, userId);

    // 各エラーケースに status code をマッピング
    if (result.kind === "article_not_found") {
      return c.json({ errors: { article: ["not found"] } }, 404);
    }
    if (result.kind === "comment_not_found") {
      return c.json({ errors: { comment: ["not found"] } }, 404);
    }
    if (result.kind === "forbidden") {
      return c.json({ errors: { comment: ["forbidden"] } }, 403);
    }

    // 削除成功
    return c.body(null, 204);
  });

export default app;
