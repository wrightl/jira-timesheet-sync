import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { RegisterForm } from "@/components/register-form";
import { getUserFromCookies } from "@/lib/auth";

export default async function RegisterPage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (user) {
    redirect("/");
  }

  return (
    <AppShell currentPath="/register">
      <main className="mx-auto flex w-full max-w-md flex-1 items-start justify-center px-6 py-12">
        <RegisterForm />
      </main>
    </AppShell>
  );
}
