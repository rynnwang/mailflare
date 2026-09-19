import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mailboxes, users } from "@/db/schema";
import { updateManagedAccountSchema } from "@/lib/validators";
import { requireTeamAdmin } from "../utils";
import { getLicenseEntitlements } from "@/lib/licenses/service";
import type { AccountRouteParams } from "./types";
import { selectAccountById, updateAccountCredentials } from "./utils";
import { deleteUserSessions } from "@/lib/auth/session";
import { removeMailboxDomainRouting } from "@/lib/mailboxes/domain-addresses";
import { createAuditLog } from "@/lib/mailboxes/audit";

export async function GET(request: Request, { params }: AccountRouteParams) {
	const access = await requireTeamAdmin(request);
	if (access.error) return access.error;
	const { id } = await params;
	const account = await selectAccountById(getDb(access.env), id);
	if (!account || (account.id !== access.user!.id && account.createdByUserId !== access.user!.id)) {
		return NextResponse.json({ error: "Account not found" }, { status: 404 });
	}
	return NextResponse.json({
		account: {
			id: account.id,
			email: account.email,
			name: account.name,
			role: account.role,
			disabled: account.disabled,
			canManageMailboxes: account.canManageMailboxes,
			forwardingEmail: account.forwardingEmail,
			canForwardEmail: (await getLicenseEntitlements(access.env)).canForwardEmail,
			hasAvatar: !!account.avatarKey,
		},
	});
}

export async function PATCH(request: Request, { params }: AccountRouteParams) {
	const access = await requireTeamAdmin(request);
	if (access.error) return access.error;
	const { id } = await params;
	const db = getDb(access.env);
	const account = await selectAccountById(db, id);
	if (!account || (account.id !== access.user!.id && account.createdByUserId !== access.user!.id)) {
		return NextResponse.json({ error: "Account not found" }, { status: 404 });
	}
	const parsed = updateManagedAccountSchema.safeParse(await request.json());
	if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	const canForwardEmail = (await getLicenseEntitlements(access.env)).canForwardEmail;
	if (!canForwardEmail && parsed.data.forwardingEmail && parsed.data.forwardingEmail !== account.forwardingEmail) {
		return NextResponse.json({ error: "A Pro or Team license is required for email forwarding" }, { status: 403 });
	}
	await updateAccountCredentials(db, id, { name: parsed.data.name, password: parsed.data.password ?? null });
	// A password set by an admin is a reset: whoever held the old one is signed out.
	if (parsed.data.password) await deleteUserSessions(access.env, id);
	await db.update(users).set({
		role: parsed.data.role,
		disabled: parsed.data.disabled,
		canManageMailboxes: parsed.data.canManageMailboxes,
		...(parsed.data.forwardingEmail !== undefined ? { forwardingEmail: parsed.data.forwardingEmail } : {}),
	}).where(eq(users.id, id));
	return NextResponse.json({ ok: true });
}

/** Removes an account this admin created — pending invite or already activated. Deletes its mailboxes' Cloudflare routing rules first, then the user row (mailboxes, aliases, tokens, etc. cascade). */
export async function DELETE(request: Request, { params }: AccountRouteParams) {
	const access = await requireTeamAdmin(request);
	if (access.error) return access.error;
	const { id } = await params;
	const db = getDb(access.env);
	const account = await selectAccountById(db, id);
	if (!account || account.createdByUserId !== access.user!.id) {
		return NextResponse.json({ error: "Account not found" }, { status: 404 });
	}
	if (account.role === "admin") {
		return NextResponse.json({ error: "Admin accounts cannot be removed" }, { status: 400 });
	}

	const ownedMailboxes = await db.select().from(mailboxes).where(eq(mailboxes.userId, id));
	try {
		for (const mailbox of ownedMailboxes) {
			await removeMailboxDomainRouting(access.env, db, {
				id: mailbox.id,
				domainId: mailbox.domainId,
				localPart: mailbox.localPart,
				useAllDomains: mailbox.useAllDomains,
			});
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to remove Cloudflare routing rule";
		return NextResponse.json({ error: message }, { status: 502 });
	}

	// Logged before the delete: targetUserId is a foreign key, and the row won't exist afterward.
	await createAuditLog(access.env, {
		actorUserId: access.user!.id,
		targetUserId: id,
		action: "account.removed",
		metadata: { email: account.email },
	});
	await db.delete(users).where(eq(users.id, id));
	return NextResponse.json({ ok: true });
}
