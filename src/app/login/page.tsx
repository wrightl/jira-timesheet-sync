import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";
import { getUserFromCookies } from "@/lib/auth";
import { isGoogleOAuthConfigured } from "@/services/google-oauth-service";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (user) {
    redirect("/");
  }

  return (
    <AppShell currentPath="/login">
      <main className="mx-auto flex w-full max-w-md flex-1 items-start justify-center px-6 py-12">
        <LoginForm googleEnabled={isGoogleOAuthConfigured()} />
      </main>
    </AppShell>
  );
}
