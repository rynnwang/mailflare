import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { getDb } from "@/db";
import { domains, mailboxes, passwordResetTokens, users } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { getLicenseEntitlements } from "@/lib/licenses/service";
import { getEnv } from "@/lib/cloudflare";

type Db = ReturnType<typeof getDb>;

async function getUserIdsWithPendingInvite(db: Db, userIds: string[]): Promise<Set<string>> {
	if (userIds.length === 0) return new Set();
	const rows = await db
		.select({ userId: passwordResetTokens.userId })
		.from(passwordResetTokens)
		.where(
			and(
				inArray(passwordResetTokens.userId, userIds),
				eq(passwordResetTokens.purpose, "invite"),
				isNull(passwordResetTokens.usedAt),
				gt(passwordResetTokens.expiresAt, new Date()),
			),
		);
	return new Set(rows.map((row) => row.userId));
}

export async function listAccountsForAdmin(db: Db) {
	const rows = await db
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			resetEmail: users.resetEmail,
			role: users.role,
			disabled: users.disabled,
			avatarKey: users.avatarKey,
			canManageMailboxes: users.canManageMailboxes,
			createdAt: users.createdAt,
		})
		.from(users)
		.orderBy(desc(users.createdAt));

	const pending = await getUserIdsWithPendingInvite(db, rows.map((row) => row.id));
	return rows.map((row) => ({ ...row, hasPendingInvite: pending.has(row.id) }));
}

export async function getDomainForAdmin(db: Db, adminUserId: string, domainId: string) {
	const [domain] = await db
		.select()
		.from(domains)
		.where(and(eq(domains.id, domainId), eq(domains.userId, adminUserId)))
		.limit(1);
	return domain ?? null;
}

export async function getExistingMailbox(db: Db, domainId: string, localPart: string) {
	const [mailbox] = await db
		.select()
		.from(mailboxes)
		.where(and(eq(mailboxes.domainId, domainId), eq(mailboxes.localPart, localPart)))
		.limit(1);
	return mailbox ?? null;
}

export function accountListItemFromUser(user: {
	id: string;
	email: string;
	name: string;
	resetEmail: string | null;
	role: "admin" | "user";
	disabled: boolean;
	avatarKey?: string | null;
	canManageMailboxes?: boolean;
	hasPendingInvite?: boolean;
	createdAt: Date;
}) {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		resetEmail: user.resetEmail,
		role: user.role,
		disabled: user.disabled,
		hasAvatar: !!user.avatarKey,
		canManageMailboxes: !!user.canManageMailboxes,
		hasPendingInvite: !!user.hasPendingInvite,
		createdAt: user.createdAt,
	};
}

export async function requireTeamAdmin(request: Request) {
	const env = getEnv();
	try {
		const user = await requireUser(env, request);
		assertAdmin(user);
		if (!(await getLicenseEntitlements(env)).canManageAccounts) {
			return {
				env,
				user,
				error: NextResponse.json({ error: "A Team license is required to manage accounts" }, { status: 403 }),
			};
		}
		return { env, user, error: null };
	} catch {
		return { env, user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
	}
}
