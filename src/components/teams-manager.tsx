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
};

type Member = {
    id: string;
    teamId: string;
    displayName: string | null;
    weeklyCapacityHours: string | null;
    userMappingId: string | null;
    appUserId: string | null;
};

type UserMapping = {
    id: string;
    jiraDisplayName: string;
    bitmapEmail: string | null;
};

export function TeamsManager({ authed }: { authed: boolean }) {
    const [teams, setTeams] = useState<Team[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [mappings, setMappings] = useState<UserMapping[]>([]);
    const [name, setName] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [memberName, setMemberName] = useState('');
    const [mappingId, setMappingId] = useState('');
    const [capacity, setCapacity] = useState('40');
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const load = () => {
        startTransition(async () => {
            setError(null);
            const [teamsRes, mappingsRes] = await Promise.all([
                fetch('/api/teams'),
                fetch('/api/user-mappings'),
            ]);
            if (!teamsRes.ok) {
                setError('Failed to load teams');
                return;
            }
            const teamsJson = (await teamsRes.json()) as {
                teams: Team[];
                members: Member[];
            };
            setTeams(teamsJson.teams);
            setMembers(teamsJson.members);
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
        });
    };

    useEffect(() => {
        if (authed) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authed]);

    if (!authed) {
        return <p className="text-sm text-muted">Sign in as admin to manage teams.</p>;
    }

    const teamMembers = members.filter((m) => m.teamId === selectedTeamId);

    return (
        <div className="space-y-6">
            {error ? <Alert variant="error">{error}</Alert> : null}

            <Card>
                <CardTitle className="mb-1">Teams</CardTitle>
                <CardDescription className="mb-4">
                    Lightweight groupings for utilisation rollups. Members can
                    link to Jira↔Bitmap user mappings.
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
                        Selected team membership and weekly capacity hours.
                    </CardDescription>
                    <form
                        className="mb-4 grid gap-2 sm:grid-cols-4"
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
                                        weeklyCapacityHours: capacity,
                                    }),
                                });
                                if (!res.ok) {
                                    setError('Failed to add member');
                                    return;
                                }
                                setMemberName('');
                                setMappingId('');
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
        </div>
    );
}
