import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createAccountInvite } from "@/lib/auth/account-invite";
import type { AccountRouteParams } from "../types";
import { selectAccountById } from "../utils";
import { requireTeamAdmin } from "../../utils";

/** Regenerates the invite link for an account that hasn't activated yet. The original token is hash-only, so a lost link can only be replaced, not recovered. */
export async function POST(request: Request, { params }: AccountRouteParams) {
	const access = await requireTeamAdmin(request);
	if (access.error) return access.error;
	const { id } = await params;
	const account = await selectAccountById(getDb(access.env), id);
	if (!account || account.createdByUserId !== access.user!.id) {
		return NextResponse.json({ error: "Account not found" }, { status: 404 });
	}
	if (!account.disabled) {
		return NextResponse.json({ error: "This account has already been activated" }, { status: 409 });
	}

	const origin = access.env.APP_URL?.trim() || new URL(request.url).origin;
	const inviteUrl = await createAccountInvite(access.env, account.id, origin);
	return NextResponse.json({ inviteUrl });
}
