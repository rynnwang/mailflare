import { Suspense } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AcceptInviteClient } from "./accept-invite-client";

export const dynamic = "force-dynamic";

export default function AcceptInvitePage() {
	return (
		<AuthGuard mode="public">
			<Suspense>
				<AcceptInviteClient />
			</Suspense>
		</AuthGuard>
	);
}
