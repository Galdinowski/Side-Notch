import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
const stateDbPath = path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb");

function readAccessToken() {
  if (!fs.existsSync(stateDbPath)) return null;
  const db = new DatabaseSync(stateDbPath, { readOnly: true });
  try {
    const row = db
      .prepare("SELECT value FROM ItemTable WHERE key = ?")
      .get("cursorAuth/accessToken");
    const token = row && typeof row.value === "string" ? row.value.trim() : "";
    return token.length > 8 ? token : null;
  } finally {
    db.close();
  }
}

async function fetchPeriodUsage(token) {
  const response = await fetch(
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        Accept: "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(7000),
    },
  );
  if (!response.ok) {
    process.stdout.write("null\n");
    process.exit(0);
  }
  process.stdout.write(`${JSON.stringify(await response.json())}\n`);
  process.exit(0);
}

const token = readAccessToken();
if (!token) {
  process.stdout.write("null\n");
  process.exit(0);
}

fetchPeriodUsage(token).catch(() => {
  process.stdout.write("null\n");
  process.exit(0);
});
