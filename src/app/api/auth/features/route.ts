import { isGoogleNativeAuthConfigured } from "@/services/google-oauth-service";

export async function GET() {
  return Response.json({
    googleEnabled: isGoogleNativeAuthConfigured(),
  });
}
