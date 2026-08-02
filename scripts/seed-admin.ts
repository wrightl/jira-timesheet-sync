import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword, normalizeEmail } from "../src/lib/password";

async function seed() {
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
  const db = getDb();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: "admin",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing[0].id));
    console.log(`Updated admin user: ${email}`);
  } else {
    await db.insert(users).values({
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
