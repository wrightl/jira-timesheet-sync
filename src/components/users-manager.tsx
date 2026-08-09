"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

type AppUserRow = {
  id: string;
  email: string;
  role: "admin" | "user";
  syncEnabled: boolean;
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
        setError(
          res.status === 401 || res.status === 403
            ? "Admin access required"
            : "Failed to load users",
        );
        setUsers([]);
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    });
  };

  useEffect(() => {
    if (authed) load();
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in as an admin to manage users.</p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <form
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
          <CardTitle className="mb-3">Add user</CardTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Email" htmlFor="user-email">
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Password" htmlFor="user-password">
              <Input
                id="user-password"
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                required
              />
            </Field>
            <Field label="Role" htmlFor="user-role">
              <Select
                id="user-role"
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
              </Select>
            </Field>
          </div>
          <div className="mt-1 flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add user"}
            </Button>
          </div>
          {error ? (
            <Alert variant="error" className="mt-3">
              {error}
            </Alert>
          ) : null}
        </form>
      </Card>

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Email</TableHeaderCell>
            <TableHeaderCell>Role</TableHeaderCell>
            <TableHeaderCell>Sync</TableHeaderCell>
            <TableHeaderCell>Reset password</TableHeaderCell>
            <TableHeaderCell />
          </tr>
        </TableHead>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted">
                No users yet.
              </TableCell>
            </TableRow>
          ) : (
            users.map((u) => {
              const isSelf = currentUserId === u.id;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.email}</div>
                    {isSelf ? (
                      <div className="text-xs text-muted">You</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={pending || isSelf}
                      title={
                        isSelf
                          ? "You cannot change your own role"
                          : undefined
                      }
                      className="disabled:opacity-60"
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
                      <Badge variant={u.role === "admin" ? "ok" : "warning"}>
                        {u.role === "admin" ? "Admin" : "User"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    <Toggle
                      checked={u.syncEnabled}
                      disabled={pending}
                      label={`Timesheet sync for ${u.email}`}
                      onCheckedChange={(next) =>
                        startTransition(async () => {
                          setError(null);
                          const res = await fetch(`/api/users?id=${u.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              syncEnabled: next,
                            }),
                          });
                          if (!res.ok) {
                            const data = await res.json().catch(() => ({}));
                            setError(data.error ?? "Sync update failed");
                            return;
                          }
                          load();
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        minLength={8}
                        placeholder="New password"
                        className="min-w-[8rem]"
                        value={passwordEdits[u.id] ?? ""}
                        onChange={(e) =>
                          setPasswordEdits({
                            ...passwordEdits,
                            [u.id]: e.target.value,
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 shrink-0 px-3 text-xs"
                        disabled={
                          pending || !(passwordEdits[u.id]?.length >= 8)
                        }
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
                              setError(
                                data.error ?? "Password update failed",
                              );
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
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      disabled={pending || isSelf}
                      title={
                        isSelf
                          ? "You cannot delete your own account"
                          : undefined
                      }
                      className="text-sm text-danger hover:underline disabled:opacity-60"
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
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
