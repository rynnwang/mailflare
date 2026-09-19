import type { AppDatabase } from "@/db";

/** Shared-mailbox delegated access is unlocked on this self-hosted instance regardless of plan. */
export async function isTeamMailboxSharingEnabled(_db: AppDatabase): Promise<boolean> {
	return true;
}
