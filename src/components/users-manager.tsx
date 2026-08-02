"use client";

import { useEffect, useState, useTransition } from "react";

type AppUserRow = {
  id: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
};

const emptyForm = {
  email: "",
  password: "",
  role: "user" as "admin" | "user",
};

export function UsersManager({
  authed,
  currentUserId,
}: {
  authed: boolean;
  currentUserId: string | null;
}) {
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [passwordEdits, setPasswordEdits] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/users");
      if (!res.ok) {
        setError(res.status === 401 || res.status === 403 ? "Admin access required" : "Failed to load users");
        setUsers([]);
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    });
  };

  useEffect(() => {
    if (authed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in as an admin to manage users.</p>
    );
  }

  return (
    <div className="space-y-6">
      <form
        className="rounded-lg border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            setError(null);
            const res = await fetch("/api/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              setError(data.error ?? "Create failed");
              return;
            }
            setForm(emptyForm);
            load();
          });
        }}
      >
        <h3 className="mb-3 text-base font-semibold">Add user</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Email</span>
            <input
              type="email"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Password</span>
            <input
              type="password"
              minLength={8}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Role</span>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value as "admin" | "user",
                })
              }
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add user"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Reset password</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = currentUserId === u.id;
                return (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.email}</div>
                      {isSelf ? (
                        <div className="text-xs text-muted">You</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={pending || isSelf}
                        title={
                          isSelf ? "You cannot change your own role" : undefined
                        }
                        className={`rounded-full px-2.5 py-0.5 text-xs disabled:opacity-60 ${
                          u.role === "admin"
                            ? "bg-ok/10 text-ok"
                            : "bg-warning/10 text-warning"
                        }`}
                        onClick={() =>
                          startTransition(async () => {
                            setError(null);
                            const res = await fetch(`/api/users?id=${u.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                role: u.role === "admin" ? "user" : "admin",
                              }),
                            });
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              setError(data.error ?? "Role update failed");
                              return;
                            }
                            load();
                          })
                        }
                      >
                        {u.role === "admin" ? "Admin" : "User"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          minLength={8}
                          placeholder="New password"
                          className="w-full min-w-[8rem] rounded-md border border-border bg-background px-2 py-1 text-sm"
                          value={passwordEdits[u.id] ?? ""}
                          onChange={(e) =>
                            setPasswordEdits({
                              ...passwordEdits,
                              [u.id]: e.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          disabled={
                            pending || !(passwordEdits[u.id]?.length >= 8)
                          }
                          className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs hover:bg-background disabled:opacity-60"
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              const res = await fetch(`/api/users?id=${u.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  password: passwordEdits[u.id],
                                }),
                              });
                              if (!res.ok) {
                                const data = await res.json().catch(() => ({}));
                                setError(data.error ?? "Password update failed");
                                return;
                              }
                              setPasswordEdits({
                                ...passwordEdits,
                                [u.id]: "",
                              });
                            })
                          }
                        >
                          Set
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={pending || isSelf}
                        title={
                          isSelf ? "You cannot delete your own account" : undefined
                        }
                        className="text-danger hover:underline disabled:opacity-60"
                        onClick={() =>
                          startTransition(async () => {
                            setError(null);
                            const res = await fetch(`/api/users?id=${u.id}`, {
                              method: "DELETE",
                            });
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              setError(data.error ?? "Delete failed");
                              return;
                            }
                            load();
                          })
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
