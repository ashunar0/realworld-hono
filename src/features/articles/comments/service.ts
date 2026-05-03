import { toCommentJson } from "../../../lib/comment";
import type { CreateCommentRequest } from "../../../schemas/comment";
import { userRepo } from "../../users/repository";
import { articleRepo } from "../repository";
import { commentRepo } from "./repository";

// コメント投稿の orchestration。
// 戻り値は tagged union: { kind: "ok", comment } | { kind: "article_not_found" }
export async function createComment(
  slug: string,
  viewerId: number,
  input: CreateCommentRequest["comment"],
) {
  // 記事データを取得
  const article = await articleRepo.findBySlug(slug);
  if (!article) return { kind: "article_not_found" as const };

  // コメントを作成
  const created = await commentRepo.create({
    body: input.body,
    articleId: article.id,
    authorId: viewerId,
  });

  // 作者データを取得
  const author = await userRepo.findById(viewerId);
  if (!author) throw new Error("author not found");

  return {
    kind: "ok" as const,
    comment: toCommentJson(created, author),
  };
}

// コメント一覧の orchestration。
// 戻り値は tagged union: { kind: "ok", comments } | { kind: "article_not_found" }
export async function listComments(slug: string) {
  // 記事データを取得
  const article = await articleRepo.findBySlug(slug);
  if (!article) return { kind: "article_not_found" as const };

  // コメント一覧を取得
  const list = await commentRepo.listByArticleId(article.id);

  return {
    kind: "ok" as const,
    comments: list.map((comment) => toCommentJson(comment, comment.author)),
  };
}

// コメント削除の orchestration。
// 戻り値は tagged union:
//   { kind: "ok" }
//   | { kind: "article_not_found" }
//   | { kind: "comment_not_found" }
//   | { kind: "forbidden" }
export async function deleteComment(
  slug: string,
  commentId: number,
  viewerId: number,
) {
  // 記事データを取得
  const article = await articleRepo.findBySlug(slug);
  if (!article) return { kind: "article_not_found" as const };

  // コメントデータを取得
  const existing = await commentRepo.findById(commentId);
  if (!existing) return { kind: "comment_not_found" as const };

  // 指定 article に属さない comment は 404 扱い
  if (existing.articleId !== article.id) {
    return { kind: "comment_not_found" as const };
  }

  // 所有者確認
  if (existing.authorId !== viewerId) {
    return { kind: "forbidden" as const };
  }

  // コメントを削除
  await commentRepo.delete(existing.id);

  return { kind: "ok" as const };
}
