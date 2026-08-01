export async function GET() {
  return Response.json({
    status: "ok",
    service: "jira-timesheet-sync",
    timestamp: new Date().toISOString(),
  });
}
