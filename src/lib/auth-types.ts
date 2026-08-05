import type { AppUser } from "@/db/schema";

export type AuthUser = Pick<AppUser, "id" | "email" | "role">;

export type AuthSuccess = { user: AuthUser; error?: undefined };
export type AuthFailure = { user?: undefined; error: Response };
export type AuthResult = AuthSuccess | AuthFailure;
