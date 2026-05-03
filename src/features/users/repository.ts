import { and, eq, ne } from "drizzle-orm";
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

  // 自分以外で email が使われているか確認（PUT /user の重複検知用）
  findByEmailExcludingId(email: string, excludeId: number) {
    return db.query.users.findFirst({
      where: and(eq(users.email, email), ne(users.id, excludeId)),
    });
  },

  // 自分以外で username が使われているか確認（PUT /user の重複検知用）
  findByUsernameExcludingId(username: string, excludeId: number) {
    return db.query.users.findFirst({
      where: and(eq(users.username, username), ne(users.id, excludeId)),
    });
  },

  // 部分更新。渡された field のみ反映、updatedAt は常に ISO で更新
  async update(
    id: number,
    fields: {
      email?: string;
      username?: string;
      passwordHash?: string;
      bio?: string | null;
      image?: string | null;
    },
  ) {
    const [row] = await db
      .update(users)
      .set({
        ...(fields.email !== undefined && { email: fields.email }),
        ...(fields.username !== undefined && { username: fields.username }),
        ...(fields.passwordHash !== undefined && {
          passwordHash: fields.passwordHash,
        }),
        ...(fields.bio !== undefined && { bio: fields.bio }),
        ...(fields.image !== undefined && { image: fields.image }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, id))
      .returning();
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
