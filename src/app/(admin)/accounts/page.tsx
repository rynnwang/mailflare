"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { authFetch } from "@/lib/auth/client";
import type { Account, AccountResponse, Domain } from "./types";

export default function AccountsPage() {
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [domains, setDomains] = useState<Domain[]>([]);
	const [username, setUsername] = useState("");
	const [domainId, setDomainId] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [inviteUrl, setInviteUrl] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);

	async function loadAccounts() {
		const response = await authFetch("/api/accounts");
		const data = (await response.json()) as AccountResponse;
		if (!response.ok) throw new Error(data.error ?? "Unable to load accounts");
		setAccounts(data.accounts ?? []);
	}

	useEffect(() => {
		loadAccounts().then(async () => {
			const response = await authFetch("/api/domains");
			const data = (await response.json()) as { domains?: Domain[]; error?: string };
			if (!response.ok) throw new Error(data.error ?? "Unable to load domains");
			setDomains(data.domains ?? []);
			setDomainId(data.domains?.[0]?.id ?? "");
		}).catch((error) => {
			setMessage(error instanceof Error ? error.message : "Unable to load accounts");
		}).finally(() => setLoading(false));
	}, []);

	async function createAccount(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setMessage(null);
		try {
			const response = await authFetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, domainId }) });
			const data = (await response.json()) as AccountResponse & { inviteUrl?: string };
			if (!response.ok) throw new Error(data.error ?? "Unable to create account");
			setUsername("");
			setInviteUrl(data.inviteUrl ?? null);
			await loadAccounts();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Unable to create account");
		} finally {
			setSaving(false);
		}
	}

	function closeCreateDialog() {
		setCreateOpen(false);
		setInviteUrl(null);
		setMessage(null);
	}

	async function copyInviteLink(url: string, id: string) {
		await navigator.clipboard.writeText(url);
		setCopiedId(id);
		setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
	}

	async function regenerateInvite(accountId: string) {
		setMessage(null);
		const response = await authFetch(`/api/accounts/${accountId}/invite`, { method: "POST" });
		const data = (await response.json()) as { inviteUrl?: string; error?: string };
		if (!response.ok) {
			setMessage(data.error ?? "Unable to generate a new invite link");
			return;
		}
		if (data.inviteUrl) await copyInviteLink(data.inviteUrl, accountId);
	}

	return <div className="space-y-6">
		<div className="flex items-center justify-between gap-4"><div><h1 className="text-3xl font-medium text-neutral-900">Accounts</h1><p className="mt-2 text-sm text-neutral-500">Manage accounts and their inboxes.</p></div><Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New account</Button></div>
		<div className="relative"><div className="grid gap-3">
			{loading && <p className="text-sm text-neutral-500">Loading...</p>}
			{accounts.map((account) => (
				<div key={account.id} className="flex items-center gap-3 rounded-3xl bg-white p-5">
					<Link href={`/accounts/${account.id}`} className="flex min-w-0 flex-1 items-center gap-4 transition-colors hover:opacity-80">
						<span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 font-semibold text-blue-700">{account.name.charAt(0).toUpperCase()}{account.hasAvatar && <img src={`/api/accounts/${account.id}/avatar`} alt="" className="absolute inset-0 h-full w-full object-cover" />}</span>
						<span className="min-w-0">
							<span className="flex items-center gap-2">
								<span className="truncate font-semibold text-neutral-900">{account.name}</span>
								<span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium capitalize text-neutral-600">{account.role}</span>
								{account.hasPendingInvite && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pending</span>}
							</span>
							<span className="block truncate text-sm text-neutral-500">{account.email}</span>
						</span>
					</Link>
					{account.hasPendingInvite && (
						<Button type="button" variant="outline" size="sm" onClick={() => regenerateInvite(account.id)}>
							<Copy className="h-4 w-4" />
							{copiedId === account.id ? "Copied" : "Copy invite link"}
						</Button>
					)}
				</div>
			))}
		</div></div>
		<Dialog open={createOpen} onOpenChange={(open) => (open ? setCreateOpen(true) : closeCreateDialog())}><DialogContent><DialogHeader><DialogTitle>Add user account</DialogTitle><DialogDescription>{inviteUrl ? "Share this link with them — it lets them set their own password." : "Creates a mailbox for them and an invite link you can share directly."}</DialogDescription></DialogHeader>
			{inviteUrl ? (
				<div className="space-y-4">
					<div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
						<span className="min-w-0 flex-1 truncate no-font-mono">{inviteUrl}</span>
					</div>
					<Button type="button" onClick={() => copyInviteLink(inviteUrl, "new")} className="w-full">
						<Copy className="h-4 w-4" />
						{copiedId === "new" ? "Copied" : "Copy link"}
					</Button>
					<Button type="button" variant="outline" onClick={closeCreateDialog} className="w-full">Done</Button>
				</div>
			) : (
				<form onSubmit={createAccount} className="space-y-4">
					<div className="space-y-2"><Label htmlFor="account-username">Email</Label><div className="flex h-10 overflow-hidden rounded-md border border-neutral-200 bg-white"><Input id="account-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="username" className="min-w-0 flex-1 rounded-none border-0 shadow-none" required /><span className="flex items-center text-sm text-neutral-400">@</span><Select aria-label="Domain" containerClassName="min-w-0 max-w-[55%] border-0 rounded-none px-0" className="min-w-0 w-full bg-transparent px-3 text-sm" value={domainId} onChange={(event) => setDomainId(event.target.value)} required><option value="">Select domain</option>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.hostname}</option>)}</Select></div></div>
					{message && <p className="text-sm text-red-600">{message}</p>}<Button type="submit" disabled={saving || !domainId}>{saving ? "Creating..." : "Create account"}</Button>
				</form>
			)}
		</DialogContent></Dialog>
	</div>;
}
