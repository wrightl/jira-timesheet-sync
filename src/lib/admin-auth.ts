/** Re-export session auth helpers. Prefer requireAdmin / requireAuth. */
export {
  requireAdmin,
  requireAuth,
  requireAdminAuth,
  getSessionUser,
  getUserFromCookies,
  type AuthUser,
  type AuthResult,
} from "@/lib/auth";
