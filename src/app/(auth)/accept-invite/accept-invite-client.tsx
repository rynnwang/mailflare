"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { MailPlus } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmInvite } from "./utils";

export function AcceptInviteClient() {
	const token = useSearchParams().get("token") ?? "";
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [done, setDone] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (password !== confirm) {
			setError("Passwords do not match");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const result = await confirmInvite(token, password);
			if (!result.ok) {
				setError(result.error ?? "Could not activate the account");
				return;
			}
			setDone(true);
		} catch {
			setError("Unable to reach the server. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	if (!token) {
		return (
			<AuthShell icon={MailPlus} title="Invite link missing" description="Open the link your admin sent you to set up your account.">
				<Link href="/login" className="text-sm text-blue-600 hover:underline">
					Go to sign in
				</Link>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			icon={MailPlus}
			title={done ? "Account activated" : "Set up your account"}
			description={
				done
					? "Your mailbox is ready. Sign in with your new password to continue."
					: "Choose a password to activate the mailbox your admin created for you."
			}
			footer={
				done ? (
					<Link href="/login" className="text-sm font-medium text-blue-600 hover:underline">
						Go to sign in
					</Link>
				) : undefined
			}
		>
			{!done && (
				<form onSubmit={onSubmit} className="space-y-5">
					<div className="space-y-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							autoComplete="new-password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							minLength={8}
							required
							autoFocus
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirm">Confirm password</Label>
						<Input
							id="confirm"
							type="password"
							autoComplete="new-password"
							value={confirm}
							onChange={(event) => setConfirm(event.target.value)}
							minLength={8}
							required
						/>
					</div>
					{error && (
						<p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
					)}
					<Button type="submit" className="h-11 w-full rounded-full px-6 active:scale-[0.98]" disabled={loading}>
						{loading ? "Activating..." : "Activate account"}
					</Button>
				</form>
			)}
		</AuthShell>
	);
}
