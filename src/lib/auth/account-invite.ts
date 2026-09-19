import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/lib/auth/password";
import { hashSessionToken } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/mailboxes/audit";

const INVITE_TOKEN_DAYS = 7;

/** Issues a one-time invite link for a freshly created, disabled account. The caller (an admin) shares it directly — nothing is emailed here. */
export async function createAccountInvite(env: CloudflareEnv, userId: string, origin: string): Promise<string> {
	const db = getDb(env);
	const token = newId("inv");
	await db.insert(passwordResetTokens).values({
		id: newId(),
		userId,
		tokenHash: await hashSessionToken(token),
		purpose: "invite",
		expiresAt: new Date(Date.now() + INVITE_TOKEN_DAYS * 24 * 60 * 60 * 1000),
	});
	return `${origin}/accept-invite?token=${encodeURIComponent(token)}`;
}

/** Redeems an invite link: sets the password, activates the account, and burns the token. */
export async function completeAccountInvite(
	env: CloudflareEnv,
	token: string,
	newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const db = getDb(env);
	const [row] = await db
		.select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
		.from(passwordResetTokens)
		.where(
			and(
				eq(passwordResetTokens.tokenHash, await hashSessionToken(token)),
				eq(passwordResetTokens.purpose, "invite"),
				gt(passwordResetTokens.expiresAt, new Date()),
				isNull(passwordResetTokens.usedAt),
			),
		)
		.limit(1);
	if (!row) return { ok: false, error: "This invite link is invalid or has expired. Ask your admin to send a new one." };

	await db.update(users).set({ passwordHash: hashPassword(newPassword), disabled: false }).where(eq(users.id, row.userId));
	await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
	await createAuditLog(env, {
		actorUserId: row.userId,
		targetUserId: row.userId,
		action: "account.activated",
	});
	return { ok: true };
}
