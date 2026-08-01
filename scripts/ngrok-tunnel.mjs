import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import ngrok from "@ngrok/ngrok";

const root = resolve(import.meta.dirname, "..");
const envLocal = resolve(root, ".env.local");
const envFile = resolve(root, ".env");

if (existsSync(envLocal)) {
  loadEnv({ path: envLocal });
} else if (existsSync(envFile)) {
  loadEnv({ path: envFile });
}

const authtoken = process.env.NGROK_AUTHTOKEN;
if (!authtoken) {
  console.error(
    "NGROK_AUTHTOKEN is not set. Add it to .env.local from https://dashboard.ngrok.com/get-started/your-authtoken",
  );
  process.exit(1);
}

const addr = Number(process.env.PORT) || 3000;
const domain = process.env.NGROK_DOMAIN || undefined;

const listener = await ngrok.forward({
  addr,
  authtoken_from_env: true,
  ...(domain ? { domain } : {}),
});

const publicUrl = listener.url();

console.log(`ngrok ingress: ${publicUrl}`);
console.log(`Jira webhook URL: ${publicUrl}/api/webhooks/jira`);
console.log(
  "Auth header: X-Webhook-Token: <JIRA_WEBHOOK_SECRET>",
);
console.log("Leave this process running while testing webhooks. Ctrl+C to stop.");

process.stdin.resume();
