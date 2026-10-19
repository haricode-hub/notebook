"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { getToken } from "@/lib/api-client";

type SessionRow = { id: string; token: string; createdAt: Date | string; expiresAt: Date | string; userAgent?: string | null; ipAddress?: string | null };

export function AccountSecurity() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshSessions() {
    const result = await authClient.listSessions();
    if (result.error) { toast.error("Could not load sessions"); return; }
    setSessions((result.data ?? []) as SessionRow[]);
    setSessionsLoaded(true);
  }

  async function changePassword() {
    setBusy(true);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setBusy(false);
    if (result.error) { toast.error("Could not change password. Check your current password."); return; }
    setCurrentPassword(""); setNewPassword("");
    toast.success("Password updated; other sessions were signed out.");
    await refreshSessions();
  }

  async function requestEmailChange() {
    setBusy(true);
    const result = await authClient.changeEmail({ newEmail: email, callbackURL: "/settings" });
    setBusy(false);
    if (result.error) { toast.error("Could not request email change. Check the address and try again."); return; }
    setEmail("");
    toast.success("If the address can be changed, a confirmation link has been sent.");
  }

  async function exportData() {
    setBusy(true);
    try {
      const token = await getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/account/export.zip`, {
        headers: { authorization: `Bearer ${token}` }, cache: "no-store",
      });
      if (!response.ok) throw new Error("Export unavailable");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "opennotebook-account-export.zip"; anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Your export is ready");
    } catch { toast.error("Could not export account data"); }
    finally { setBusy(false); }
  }

  async function deleteAccount() {
    if (!window.confirm("Permanently delete this account, notebooks, and uploaded files? This cannot be undone.")) return;
    setBusy(true);
    const result = await authClient.deleteUser({ password: deletePassword, callbackURL: "/sign-in" });
    setBusy(false);
    if (result.error) { toast.error("Could not request account deletion. Check your password and email."); return; }
    setDeletePassword("");
    toast.success("Check your email to confirm account deletion.");
  }

  return <section className="mt-8 space-y-8 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900" aria-labelledby="account-security-title">
    <div><h2 id="account-security-title" className="text-xl font-semibold">Account security and data</h2><p className="mt-1 text-sm text-slate-500">Manage sign-in details, active sessions, and your data.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="change-email">New email</Label><Input id="change-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /><Button variant="outline" disabled={busy || !email} onClick={() => void requestEmailChange()}>Send confirmation link</Button></div>
      <div className="space-y-2"><Label htmlFor="delete-password">Password to confirm deletion</Label><Input id="delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /><Button variant="destructive" disabled={busy || !deletePassword} onClick={() => void deleteAccount()}>Delete account</Button></div>
    </div>
    <div className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800"><h3 className="font-medium">Change password</h3><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div></div><Button variant="outline" disabled={busy || !currentPassword || newPassword.length < 8} onClick={() => void changePassword()}>Update password</Button></div>
    <div className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800"><div className="flex items-center justify-between"><h3 className="font-medium">Sessions</h3><Button variant="outline" size="sm" onClick={() => void refreshSessions()}>Refresh</Button></div>{sessions.length === 0 ? <p className="text-sm text-slate-500">{sessionsLoaded ? "No active sessions found." : "Refresh to load active sessions."}</p> : <ul className="space-y-2">{sessions.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800"><span>{session.userAgent || "Unknown device"} · expires {new Date(session.expiresAt).toLocaleDateString()}</span><Button size="sm" variant="outline" onClick={async () => { const result = await authClient.revokeSession({ token: session.token }); if (result.error) toast.error("Could not revoke session"); else { toast.success("Session revoked"); await refreshSessions(); } }}>Revoke</Button></li>)}</ul>}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-800"><div><h3 className="font-medium">Export your data</h3><p className="text-sm text-slate-500">Download notebooks, source text, notes, artifacts, and citations.</p></div><Button variant="outline" disabled={busy} onClick={() => void exportData()}>Download ZIP</Button></div>
  </section>;
}
