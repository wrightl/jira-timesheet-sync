import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";
import { getUserFromCookies } from "@/lib/auth";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-mappings");

  return (
    <AppShell
      currentPath="/settings"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h2 className="mb-2 text-xl font-semibold">Settings</h2>
        <p className="mb-6 text-sm text-muted">
          Configure the access token used when calling the Bitmap timesheet API.
        </p>
        <SettingsForm authed />
      </main>
    </AppShell>
  );
}
