'use client';

/**
 * Dashboard → Team
 *
 * Allows owners and admins to:
 *  - View current team members and their roles
 *  - Invite new users (generates an accept link)
 *  - Change a member's role
 *  - Remove a member
 *  - View and revoke pending invitations
 */

import { useEffect, useState } from 'react';
import { fetchBackend } from '@/lib/supabase';

type Role = 'owner' | 'admin' | 'member' | 'viewer';

interface Member {
  id: string;
  userId: string;
  email: string;
  role: Role;
  invitedBy: string | null;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: Exclude<Role, 'owner'>;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<Role, string> = {
  owner: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  member: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  viewer: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300',
};

const ASSIGNABLE_ROLES: Exclude<Role, 'owner'>[] = ['admin', 'member', 'viewer'];

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<Role>('viewer');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<Role, 'owner'>>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ url: string; email: string } | null>(null);
  const [inviteError, setInviteError] = useState('');

  // Role change
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<Exclude<Role, 'owner'>>('member');
  const [savingRole, setSavingRole] = useState(false);

  // General error
  const [actionError, setActionError] = useState('');

  async function loadData() {
    setLoading(true);
    setActionError('');
    try {
      const [membersRes, invitationsRes, meRes] = await Promise.all([
        fetchBackend('/api/team/members'),
        fetchBackend('/api/team/invitations'),
        fetchBackend('/api/business/me'),
      ]);

      if (membersRes.ok) {
        const json = (await membersRes.json()) as { data?: Member[] };
        setMembers(json.data ?? []);
      }
      if (invitationsRes.ok) {
        const json = (await invitationsRes.json()) as { data?: Invitation[] };
        setInvitations(json.data ?? []);
      }
      // Derive current user's role from the members list
      // We rely on /api/business/me returning ownerUserId for comparison
      // Alternatively we store role in the auth result; for now use the members list
      if (meRes.ok) {
        const meJson = (await meRes.json()) as { data?: { ownerUserId?: string } };
        // Will update myRole once we have member list with current user's entry
        const _ = meJson; // used below after members load
      }
    } finally {
      setLoading(false);
    }
  }

  // Derive own role from members list using current Supabase session
  useEffect(() => {
    (async () => {
      await loadData();
      // get current user id from supabase
      try {
        const { getSupabaseBrowserClient } = await import('@/lib/supabase');
        const { data } = await getSupabaseBrowserClient().auth.getUser();
        if (data.user) {
          setMembers((prev) => {
            const me = prev.find((m) => m.userId === data.user!.id);
            if (me) setMyRole(me.role);
            return prev;
          });
        }
      } catch {
        // non-critical
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-derive myRole whenever members list updates
  useEffect(() => {
    (async () => {
      try {
        const { getSupabaseBrowserClient } = await import('@/lib/supabase');
        const { data } = await getSupabaseBrowserClient().auth.getUser();
        if (data.user) {
          const me = members.find((m) => m.userId === data.user!.id);
          if (me) setMyRole(me.role);
        }
      } catch {
        // non-critical
      }
    })();
  }, [members]);

  const canManage = myRole === 'owner' || myRole === 'admin';
  const canInviteRole = (role: Role): boolean => {
    const ranks: Record<Role, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
    return ranks[myRole] > ranks[role];
  };

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    setInviteResult(null);

    const res = await fetchBackend('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });

    const json = (await res.json()) as {
      ok: boolean;
      error?: string;
      data?: { invitation: Invitation; acceptUrl: string };
    };

    if (!res.ok || !json.ok) {
      setInviteError(json.error ?? 'Failed to send invitation');
    } else if (json.data) {
      setInviteResult({ url: json.data.acceptUrl, email: inviteEmail.trim() });
      setInviteEmail('');
      setInvitations((prev) => [json.data!.invitation, ...prev]);
    }
    setInviting(false);
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm('Remove this member from the team?')) return;
    setActionError('');
    const res = await fetchBackend(`/api/team/members/${memberId}`, { method: 'DELETE' });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      setActionError(json.error ?? 'Failed to remove member');
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    }
  }

  async function handleSaveRole(memberId: string) {
    setSavingRole(true);
    setActionError('');
    const res = await fetchBackend(`/api/team/members/${memberId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: editRole }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string; data?: Member };
    if (!json.ok) {
      setActionError(json.error ?? 'Failed to update role');
    } else if (json.data) {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? json.data! : m)));
      setEditingMemberId(null);
    }
    setSavingRole(false);
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!confirm('Revoke this invitation?')) return;
    setActionError('');
    const res = await fetchBackend(`/api/team/invitations/${invitationId}`, { method: 'DELETE' });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      setActionError(json.error ?? 'Failed to revoke invitation');
    } else {
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-6">Team</h1>
        <p className="text-gray-500 dark:text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-1">Team</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Manage who has access to this business account. Plans are billed at the business level.
        </p>
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {actionError}
        </div>
      )}

      {/* ── Members list ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-4">
          Members ({members.length})
        </h2>
        <div className="divide-y divide-gray-100 dark:divide-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-4 px-5 py-4 bg-white dark:bg-slate-900"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                  {member.email || member.userId}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                  Joined {new Date(member.createdAt).toLocaleDateString()}
                </p>
              </div>

              {editingMemberId === member.id ? (
                <div className="flex items-center gap-2">
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as Exclude<Role, 'owner'>)}
                    className="text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 px-2 py-1"
                  >
                    {ASSIGNABLE_ROLES.filter(canInviteRole).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSaveRole(member.id)}
                    disabled={savingRole}
                    className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingMemberId(null)}
                    className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <RoleBadge role={member.role} />
                  {canManage && member.role !== 'owner' && canInviteRole(member.role) && (
                    <>
                      <button
                        onClick={() => {
                          setEditingMemberId(member.id);
                          setEditRole(member.role as Exclude<Role, 'owner'>);
                        }}
                        className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-slate-500 bg-white dark:bg-slate-900">
              No members yet.
            </div>
          )}
        </div>
      </section>

      {/* ── Pending invitations ── */}
      {invitations.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-4">
            Pending Invitations ({invitations.length})
          </h2>
          <div className="divide-y divide-gray-100 dark:divide-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-4 px-5 py-4 bg-white dark:bg-slate-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
                    {inv.email}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <RoleBadge role={inv.role} />
                  {canManage && (
                    <button
                      onClick={() => handleRevokeInvitation(inv.id)}
                      className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Invite form ── */}
      {canManage && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-4">
            Invite Member
          </h2>
          <form
            onSubmit={handleInvite}
            className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Exclude<Role, 'owner'>)}
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  {ASSIGNABLE_ROLES.filter(canInviteRole).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>

            {inviteError && (
              <p className="text-sm text-red-500 dark:text-red-400">{inviteError}</p>
            )}

            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {inviting ? 'Sending…' : 'Send invitation'}
            </button>
          </form>

          {/* Invite link result */}
          {inviteResult && (
            <div className="mt-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-5 space-y-3">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                Invitation created for <strong>{inviteResult.email}</strong>
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Share this link with them. It expires in 7 days.
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteResult.url}
                  className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-gray-700 dark:text-slate-300 px-3 py-2 font-mono"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(inviteResult.url)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Copy
                </button>
              </div>
              <button
                onClick={() => setInviteResult(null)}
                className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
              >
                Dismiss
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Role descriptions ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-3">Role Permissions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              {
                role: 'owner' as Role,
                desc: 'Full control — billing, settings, invite any role, rotate API keys. Cannot be removed.',
              },
              {
                role: 'admin' as Role,
                desc: 'Manage settings, knowledge, conversations. Invite member/viewer roles.',
              },
              {
                role: 'member' as Role,
                desc: 'Upload knowledge, view conversations. Cannot change settings or invite others.',
              },
              {
                role: 'viewer' as Role,
                desc: 'Read-only access to dashboard, conversations, and knowledge.',
              },
            ] satisfies { role: Role; desc: string }[]
          ).map(({ role, desc }) => (
            <div
              key={role}
              className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <RoleBadge role={role} />
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
