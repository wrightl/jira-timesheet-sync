import { cookies } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { AdminLogin } from "@/components/admin-login";
import { SettingsForm } from "@/components/settings-form";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const adminKey = cookieStore.get("admin_api_key")?.value;
  const authed = Boolean(
    adminKey && process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY,
  );

  return (
    <>
      <AppNav currentPath="/settings" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <AdminLogin initiallyAuthed={authed} />
        <h2 className="mb-2 text-xl font-semibold">Settings</h2>
        <p className="mb-6 text-sm text-muted">
          Configure the access token used when calling the internal project
          management timesheet API.
        </p>
        <SettingsForm authed={authed} />
      </main>
    </>
  );
}
