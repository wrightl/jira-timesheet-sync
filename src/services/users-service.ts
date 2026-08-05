import { getDb, type Db } from "@/db";
import {
  UsersRepository,
  type PublicUser,
} from "@/repositories/users-repository";
import { hashPassword, normalizeEmail } from "@/lib/password";
import type {
  AdminUserCreateInput,
  AdminUserUpdateInput,
} from "@/lib/validators";

export type UsersServiceError =
  | { code: "not_found"; message: string }
  | { code: "conflict"; message: string }
  | { code: "bad_request"; message: string };

export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  list(): Promise<PublicUser[]> {
    return this.users.listPublic();
  }

  async create(
    input: AdminUserCreateInput,
  ): Promise<{ user: PublicUser } | { error: UsersServiceError }> {
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.users.create({
        email,
        passwordHash,
        role: input.role,
      });
      return { user };
    } catch {
      return {
        error: { code: "conflict", message: "Email already registered" },
      };
    }
  }

  async update(
    id: string,
    input: AdminUserUpdateInput,
    actorId: string,
  ): Promise<{ user: PublicUser } | { error: UsersServiceError }> {
    const target = await this.users.findById(id);
    if (!target) {
      return { error: { code: "not_found", message: "User not found" } };
    }

    if (input.role && input.role !== target.role && actorId === id) {
      return {
        error: {
          code: "bad_request",
          message: "You cannot change your own role",
        },
      };
    }

    if (target.role === "admin" && input.role === "user") {
      const adminCount = await this.users.countAdmins();
      if (adminCount <= 1) {
        return {
          error: {
            code: "bad_request",
            message: "Cannot demote the last remaining admin",
          },
        };
      }
    }

    const updates: {
      role?: "admin" | "user";
      passwordHash?: string;
    } = {};

    if (input.role) updates.role = input.role;
    if (input.password) {
      updates.passwordHash = await hashPassword(input.password);
    }

    const user = await this.users.update(id, updates);
    if (!user) {
      return { error: { code: "not_found", message: "User not found" } };
    }
    return { user };
  }

  async delete(
    id: string,
    actorId: string,
  ): Promise<{ ok: true } | { error: UsersServiceError }> {
    if (actorId === id) {
      return {
        error: {
          code: "bad_request",
          message: "You cannot delete your own account",
        },
      };
    }

    const target = await this.users.findById(id);
    if (!target) {
      return { error: { code: "not_found", message: "User not found" } };
    }

    if (target.role === "admin") {
      const adminCount = await this.users.countAdmins();
      if (adminCount <= 1) {
        return {
          error: {
            code: "bad_request",
            message: "Cannot delete the last remaining admin",
          },
        };
      }
    }

    await this.users.delete(id);
    return { ok: true };
  }
}

export function createUsersService(db: Db = getDb()) {
  return new UsersService(new UsersRepository(db));
}
