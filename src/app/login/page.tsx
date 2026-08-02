import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";
import { getUserFromCookies } from "@/lib/auth";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (user) {
    redirect("/");
  }

  return (
    <AppShell currentPath="/login">
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12">
        <LoginForm />
      </main>
    </AppShell>
  );
}
