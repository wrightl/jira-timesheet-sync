'use client';

import { useEffect, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from '@/components/ui/table';

type Team = {
    id: string;
    name: string;
    memberCount?: number;
    ownershipCount?: number;
};

type Member = {
    id: string;
    teamId: string;
    displayName: string | null;
    weeklyCapacityHours: string | null;
    userMappingId: string | null;
    appUserId: string | null;
};

type Ownership = {
    id: string;
    teamId: string;
    teamName: string;
    clientId: string;
    clientName: string | null;
    projectId: string;
    projectName: string | null;
};

type UserMapping = {
    id: string;
    jiraDisplayName: string;
    bitmapEmail: string | null;
};

type AppUserOption = {
    id: string;
    email: string;
};

type BitmapClient = {
    id: string;
    name: string;
};

type BitmapProject = {
    id: string;
    name?: string | null;
    key?: string | null;
};

export function TeamsManager({ authed }: { authed: boolean }) {
    const [teams, setTeams] = useState<Team[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [ownerships, setOwnerships] = useState<Ownership[]>([]);
    const [mappings, setMappings] = useState<UserMapping[]>([]);
    const [appUsers, setAppUsers] = useState<AppUserOption[]>([]);
    const [clients, setClients] = useState<BitmapClient[]>([]);
    const [projects, setProjects] = useState<BitmapProject[]>([]);
    const [name, setName] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [memberName, setMemberName] = useState('');
    const [mappingId, setMappingId] = useState('');
    const [appUserId, setAppUserId] = useState('');
    const [capacity, setCapacity] = useState('40');
    const [clientId, setClientId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const load = () => {
        startTransition(async () => {
            setError(null);
            const [teamsRes, mappingsRes, usersRes, clientsRes] =
                await Promise.all([
                    fetch('/api/teams'),
                    fetch('/api/user-mappings'),
                    fetch('/api/users'),
                    fetch('/api/bitmap/clients'),
                ]);
            if (!teamsRes.ok) {
                setError('Failed to load teams');
                return;
            }
            const teamsJson = (await teamsRes.json()) as {
                teams: Team[];
                members: Member[];
                ownerships?: Ownership[];
            };
            setTeams(teamsJson.teams);
            setMembers(teamsJson.members);
            setOwnerships(teamsJson.ownerships ?? []);
            if (!selectedTeamId && teamsJson.teams[0]) {
                setSelectedTeamId(teamsJson.teams[0].id);
            }
            if (mappingsRes.ok) {
                const mappingsJson = (await mappingsRes.json()) as
                    | { mappings?: UserMapping[] }
                    | UserMapping[];
                setMappings(
                    Array.isArray(mappingsJson)
                        ? mappingsJson
                        : (mappingsJson.mappings ?? []),
                );
            }
            if (usersRes.ok) {
                const usersJson = (await usersRes.json()) as {
                    users: AppUserOption[];
                };
                setAppUsers(usersJson.users ?? []);
            }
            if (clientsRes.ok) {
                const clientsJson = (await clientsRes.json()) as {
                    clients: BitmapClient[];
                };
                setClients(clientsJson.clients ?? []);
            }
        });
    };

    useEffect(() => {
        if (authed) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authed]);

    useEffect(() => {
        if (!clientId) {
            setProjects([]);
            setProjectId('');
            return;
        }
        let cancelled = false;
        void (async () => {
            const res = await fetch(
                `/api/bitmap/projects?clientId=${encodeURIComponent(clientId)}&status=active`,
            );
            if (!res.ok || cancelled) return;
            const data = (await res.json()) as { projects?: BitmapProject[] };
            if (cancelled) return;
            setProjects(data.projects ?? []);
        })();
        return () => {
            cancelled = true;
        };
    }, [clientId]);

    if (!authed) {
        return (
            <p className="text-sm text-muted">
                Sign in as admin to manage teams.
            </p>
        );
    }

    const teamMembers = members.filter((m) => m.teamId === selectedTeamId);
    const teamOwnerships = ownerships.filter(
        (o) => o.teamId === selectedTeamId,
    );
    const selectedClient = clients.find((c) => c.id === clientId);
    const selectedProject = projects.find((p) => p.id === projectId);

    return (
        <div className="space-y-6">
            {error ? <Alert variant="error">{error}</Alert> : null}

            <Card>
                <CardTitle className="mb-1">Teams</CardTitle>
                <CardDescription className="mb-4">
                    Groupings for utilisation rollups and client/project
                    ownership used by portfolio “my risk” and alert routing.
                    Link members to app users so ownership filters work.
                </CardDescription>
                <form
                    className="mb-4 flex flex-col gap-2 sm:flex-row"
                    onSubmit={(e) => {
                        e.preventDefault();
                        startTransition(async () => {
                            const res = await fetch('/api/teams', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name }),
                            });
                            if (!res.ok) {
                                setError('Failed to create team');
                                return;
                            }
                            setName('');
                            load();
                        });
                    }}
                >
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Team name"
                        required
                    />
                    <Button type="submit" disabled={pending}>
                        Add team
                    </Button>
                </form>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>Name</TableHeaderCell>
                            <TableHeaderCell>Members</TableHeaderCell>
                            <TableHeaderCell>Ownerships</TableHeaderCell>
                            <TableHeaderCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {teams.map((team) => (
                            <TableRow key={team.id}>
                                <TableCell>
                                    <button
                                        type="button"
                                        className={
                                            selectedTeamId === team.id
                                                ? 'font-medium text-accent'
                                                : 'text-foreground'
                                        }
                                        onClick={() =>
                                            setSelectedTeamId(team.id)
                                        }
                                    >
                                        {team.name}
                                    </button>
                                </TableCell>
                                <TableCell>{team.memberCount ?? 0}</TableCell>
                                <TableCell>
                                    {team.ownershipCount ?? 0}
                                </TableCell>
                                <TableCell>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        disabled={pending}
                                        onClick={() => {
                                            startTransition(async () => {
                                                await fetch(
                                                    `/api/teams/${team.id}`,
                                                    { method: 'DELETE' },
                                                );
                                                if (
                                                    selectedTeamId === team.id
                                                ) {
                                                    setSelectedTeamId('');
                                                }
                                                load();
                                            });
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>

            {selectedTeamId ? (
                <Card>
                    <CardTitle className="mb-1">Team members</CardTitle>
                    <CardDescription className="mb-4">
                        Selected team membership, weekly capacity, and optional
                        app user link for “my risk”.
                    </CardDescription>
                    <form
                        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            startTransition(async () => {
                                const res = await fetch('/api/teams/members', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        teamId: selectedTeamId,
                                        displayName: memberName || null,
                                        userMappingId: mappingId || null,
                                        appUserId: appUserId || null,
                                        weeklyCapacityHours: capacity,
                                    }),
                                });
                                if (!res.ok) {
                                    setError('Failed to add member');
                                    return;
                                }
                                setMemberName('');
                                setMappingId('');
                                setAppUserId('');
                                load();
                            });
                        }}
                    >
                        <Input
                            value={memberName}
                            onChange={(e) => setMemberName(e.target.value)}
                            placeholder="Display name"
                        />
                        <select
                            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                            value={mappingId}
                            onChange={(e) => setMappingId(e.target.value)}
                        >
                            <option value="">User mapping (optional)</option>
                            {mappings.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.jiraDisplayName}
                                </option>
                            ))}
                        </select>
                        <select
                            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                            value={appUserId}
                            onChange={(e) => setAppUserId(e.target.value)}
                        >
                            <option value="">App user (for my risk)</option>
                            {appUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.email}
                                </option>
                            ))}
                        </select>
                        <Input
                            value={capacity}
                            onChange={(e) => setCapacity(e.target.value)}
                            placeholder="Weekly hours"
                        />
                        <Button type="submit" disabled={pending}>
                            Add member
                        </Button>
                    </form>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>Name</TableHeaderCell>
                                <TableHeaderCell>Capacity</TableHeaderCell>
                                <TableHeaderCell>App user</TableHeaderCell>
                                <TableHeaderCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {teamMembers.map((member) => (
                                <TableRow key={member.id}>
                                    <TableCell>
                                        {member.displayName ?? '—'}
                                    </TableCell>
                                    <TableCell>
                                        {member.weeklyCapacityHours ?? '40'}h
                                    </TableCell>
                                    <TableCell className="text-xs text-muted">
                                        {member.appUserId
                                            ? (appUsers.find(
                                                  (u) =>
                                                      u.id === member.appUserId,
                                              )?.email ?? member.appUserId)
                                            : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => {
                                                startTransition(async () => {
                                                    await fetch(
                                                        `/api/teams/members/${member.id}`,
                                                        { method: 'DELETE' },
                                                    );
                                                    load();
                                                });
                                            }}
                                        >
                                            Remove
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            ) : null}

            {selectedTeamId ? (
                <Card>
                    <CardTitle className="mb-1">Client / project ownership</CardTitle>
                    <CardDescription className="mb-4">
                        Attach Bitmap clients (and optionally a project) so
                        portfolio filters and alert digests can route by owning
                        team.
                    </CardDescription>
                    <form
                        className="mb-4 grid gap-2 sm:grid-cols-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!clientId) {
                                setError('Select a client');
                                return;
                            }
                            startTransition(async () => {
                                const res = await fetch(
                                    '/api/teams/ownerships',
                                    {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                            teamId: selectedTeamId,
                                            clientId,
                                            clientName:
                                                selectedClient?.name ?? null,
                                            projectId: projectId || '',
                                            projectName:
                                                selectedProject?.name ??
                                                selectedProject?.key ??
                                                null,
                                        }),
                                    },
                                );
                                if (!res.ok) {
                                    const data = await res
                                        .json()
                                        .catch(() => ({}));
                                    setError(
                                        (data as { error?: string }).error ??
                                            'Failed to add ownership',
                                    );
                                    return;
                                }
                                setProjectId('');
                                load();
                            });
                        }}
                    >
                        <select
                            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                            value={clientId}
                            onChange={(e) => {
                                setClientId(e.target.value);
                                setProjectId('');
                            }}
                            required
                        >
                            <option value="">Client</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        <select
                            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            disabled={!clientId}
                        >
                            <option value="">Entire client</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name ?? p.key ?? p.id}
                                </option>
                            ))}
                        </select>
                        <Button type="submit" disabled={pending || !clientId}>
                            Add ownership
                        </Button>
                    </form>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>Client</TableHeaderCell>
                                <TableHeaderCell>Project</TableHeaderCell>
                                <TableHeaderCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {teamOwnerships.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={3}
                                        className="text-muted"
                                    >
                                        No ownerships yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                teamOwnerships.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            {row.clientName ?? row.clientId}
                                        </TableCell>
                                        <TableCell>
                                            {row.projectId
                                                ? (row.projectName ??
                                                  row.projectId)
                                                : 'Entire client'}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => {
                                                    startTransition(
                                                        async () => {
                                                            await fetch(
                                                                `/api/teams/ownerships/${row.id}`,
                                                                {
                                                                    method:
                                                                        'DELETE',
                                                                },
                                                            );
                                                            load();
                                                        },
                                                    );
                                                }}
                                            >
                                                Remove
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </Card>
            ) : null}
        </div>
    );
}
