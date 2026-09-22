import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAttachPlan,
  buildCursorComposerUri,
  buildCursorOpenArgs,
  buildCursorLaunch,
  isCursorCloudAgentId,
  isSafeSessionId,
  parseOpenRequest,
  planOpenAgent,
  safeWindowTitle,
} from "../dist-electron/electron/open-agent.js";
import { pickExecutable } from "../dist-electron/electron/which.js";

test("which skips the extensionless launcher that Windows cannot spawn", () => {
  assert.equal(
    pickExecutable([
      "C:\\Program Files\\cursor\\resources\\app\\bin\\cursor",
      "C:\\Program Files\\cursor\\resources\\app\\bin\\cursor.cmd",
      "",
    ]),
    "C:\\Program Files\\cursor\\resources\\app\\bin\\cursor.cmd",
  );
  assert.equal(pickExecutable(["C:\\Users\\arthu\\.local\\bin\\claude.exe"]), "C:\\Users\\arthu\\.local\\bin\\claude.exe");
  assert.equal(pickExecutable(["", "  "]), null);
});

test("the Cursor CLI script is replaced by cli.js inside the app executable", () => {
  const launch = buildCursorLaunch(
    "C:\\Program Files\\cursor\\resources\\app\\bin\\cursor.cmd",
    "7f22710c-ad36-4a89-96f8-d9dfc581d864",
    () => true,
  );
  assert.equal(launch.bin, "C:\\Program Files\\cursor\\Cursor.exe");
  assert.equal(launch.args[0], "C:\\Program Files\\cursor\\resources\\app\\out\\cli.js");
  assert.deepEqual(launch.env, { ELECTRON_RUN_AS_NODE: "1" });
});

test("an unexpected Cursor layout keeps the CLI path instead of guessing", () => {
  const launch = buildCursorLaunch("C:\\tools\\cursor.cmd", "6197d15c", () => false);
  assert.equal(launch.bin, "C:\\tools\\cursor.cmd");
  assert.equal(launch.env, undefined);
});

test("open request rejects unsafe ids and unknown sources", () => {
  assert.equal(isSafeSessionId("6197d15c"), true);
  assert.equal(isSafeSessionId("7f22710c-ad36-4a89-96f8-d9dfc581d864"), true);
  assert.equal(isSafeSessionId("id with spaces"), false);
  assert.equal(isSafeSessionId("foo&bar"), false);
  assert.equal(parseOpenRequest({ source: "claude", id: "bad id" }), null);
  assert.equal(parseOpenRequest({ source: "nope", id: "6197d15c" }), null);
});

test("background Claude jobs attach in a new terminal at the project cwd", () => {
  const request = parseOpenRequest({
    source: "claude",
    id: "6197d15c",
    attachId: "6197d15c",
    workspacePath: "C:\\git\\ss_erp_tag1-cmx0189",
    name: 'C:\\git pasta skill agentes',
  });
  const plan = planOpenAgent(request, {
    claudeBin: "C:\\Users\\arthu\\.local\\bin\\claude.exe",
    cursorBin: null,
    wtBin: "C:\\Windows\\System32\\wt.exe",
    pathExists: () => true,
  });
  assert.equal(plan.action, "attach");
  assert.deepEqual(plan.attach.args, [
    "-w",
    "0",
    "new-tab",
    "-d",
    request.workspacePath,
    "--title",
    "C:\\git pasta skill agentes",
    "C:\\Users\\arthu\\.local\\bin\\claude.exe",
    "attach",
    "6197d15c",
  ]);
});

test("interactive Claude sessions focus the live pid and never run claude attach", () => {
  const request = parseOpenRequest({
    source: "claude",
    id: "55e1cd57",
    workspacePath: "C:\\git\\ss_erp_tag-prd0141",
    pid: 23220,
    name: "ss-erp-tag-prd0141-ad",
  });
  const plan = planOpenAgent(request, {
    claudeBin: "claude.exe",
    cursorBin: null,
    wtBin: null,
    pathExists: () => true,
  });
  assert.equal(plan.action, "focus");
  assert.equal(plan.pid, 23220);
  assert.deepEqual(plan.fallback, {
    action: "open-folder",
    target: request.workspacePath,
  });
});

test("background Claude jobs fall back to attach when focusing the pid fails", () => {
  const request = parseOpenRequest({
    source: "claude",
    id: "493cab67",
    attachId: "493cab67",
    workspacePath: "C:\\git\\ss_erp_tag1-ger5652",
    pid: 38316,
    name: "Pedidos por Carga",
  });
  const plan = planOpenAgent(request, {
    claudeBin: "claude.exe",
    cursorBin: null,
    wtBin: null,
    pathExists: () => true,
  });
  assert.equal(plan.action, "focus");
  assert.equal(plan.fallback.action, "attach");
  assert.deepEqual(plan.fallback.attach.args.slice(-2), ["attach", "493cab67"]);
});

test("cmd attach quotes the window title without injecting the name as a command", () => {
  const attach = buildAttachPlan(
    "claude.exe",
    "493cab67",
    "C:\\git\\ss_erp_tag1-ger5652",
    safeWindowTitle('Pedidos por Carga romaneio múltiplas notas'),
    null,
  );
  assert.equal(attach.launcher, "cmd");
  assert.deepEqual(attach.args.slice(0, 4), [
    "/c",
    "start",
    "Pedidos por Carga romaneio múltiplas notas",
    "/D",
  ]);
});

test("Cursor opens the matching composer chat, not the workspace folder", () => {
  const request = parseOpenRequest({
    source: "cursor",
    id: "7f22710c-ad36-4a89-96f8-d9dfc581d864",
    workspacePath: "C:\\Users\\arthu\\Projects\\Side-Notch",
  });
  const plan = planOpenAgent(request, {
    claudeBin: null,
    cursorBin: "C:\\cursor\\cursor.exe",
    wtBin: null,
    pathExists: () => true,
    fileExists: () => false,
  });
  assert.equal(isCursorCloudAgentId(request.id), false);
  assert.equal(buildCursorComposerUri(request.id), "cursor.composer:7f22710c-ad36-4a89-96f8-d9dfc581d864");
  assert.deepEqual(plan, {
    action: "open-app",
    bin: "C:\\cursor\\cursor.exe",
    args: buildCursorOpenArgs(request.id),
  });
  assert.deepEqual(plan.args, [
    "--reuse-window",
    "--file-uri",
    "cursor.composer:7f22710c-ad36-4a89-96f8-d9dfc581d864",
  ]);
  assert.equal(plan.args.includes(request.workspacePath), false);
});

test("Cursor cloud agents open via the background-agent deeplink", () => {
  const request = parseOpenRequest({
    source: "cursor",
    id: "bc-f6ef9ae1-c8fa-421b-bef0-dba60a486acc",
    workspacePath: null,
  });
  const plan = planOpenAgent(request, {
    claudeBin: null,
    cursorBin: "C:\\cursor\\cursor.exe",
    wtBin: null,
    pathExists: () => false,
    fileExists: () => false,
  });
  assert.equal(isCursorCloudAgentId(request.id), true);
  assert.deepEqual(plan, {
    action: "open-app",
    bin: "C:\\cursor\\cursor.exe",
    args: [
      "--open-url",
      "--",
      "cursor://anysphere.cursor-deeplink/background-agent?bcId=bc-f6ef9ae1-c8fa-421b-bef0-dba60a486acc",
    ],
  });
});
