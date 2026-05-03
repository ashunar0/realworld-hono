import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { follows, users } from "../../db/schema";

export const userRepo = {
  // ID から user を取得。存在しなければ undefined
  findById(id: number) {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  },

  // username から user を取得。存在しなければ undefined
  findByUsername(username: string) {
    return db.query.users.findFirst({
      where: eq(users.username, username),
    });
  },

  // email から user を取得。存在しなければ undefined
  findByEmail(email: string) {
    return db.query.users.findFirst({
      where: eq(users.email, email),
    });
  },

  // 新規ユーザー作成。createdAt/updatedAt は内部で ISO 生成
  async create(fields: {
    username: string;
    email: string;
    passwordHash: string;
  }) {
    const now = new Date().toISOString();
    const [row] = await db
      .insert(users)
      .values({ ...fields, createdAt: now, updatedAt: now })
      .returning();
    if (!row) throw new Error("failed to create user");
    return row;
  },

  // プロフィール表示用に followers を eager load した user を取得
  findByUsernameWithFollowers(username: string) {
    return db.query.users.findFirst({
      where: eq(users.username, username),
      with: { followers: true },
    });
  },

  // この user がフォローしている user の ID 一覧
  async findFollowingIds(userId: number) {
    const rows = await db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));
    return rows.map((r) => r.id);
  },

  // フォロー関係を作成。重複は無視
  async createFollow(followerId: number, followingId: number) {
    await db
      .insert(follows)
      .values({ followerId, followingId })
      .onConflictDoNothing();
  },

  // フォロー関係を削除
  async deleteFollow(followerId: number, followingId: number) {
    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId),
        ),
      );
  },
};
