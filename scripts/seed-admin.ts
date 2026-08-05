import { getDb } from "../src/db";
import { UsersRepository } from "../src/repositories/users-repository";
import { hashPassword, normalizeEmail } from "../src/lib/password";
import { loadScriptEnv } from "./lib/bootstrap";

async function seed() {
  loadScriptEnv();

  const emailRaw = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!emailRaw || !password) {
    console.error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin user.",
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const email = normalizeEmail(emailRaw);
  const passwordHash = await hashPassword(password);
  const users = new UsersRepository(getDb());

  const existing = await users.findByEmail(email);

  if (existing) {
    await users.update(existing.id, {
      passwordHash,
      role: "admin",
    });
    console.log(`Updated admin user: ${email}`);
  } else {
    await users.createFull({
      email,
      passwordHash,
      role: "admin",
    });
    console.log(`Created admin user: ${email}`);
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
