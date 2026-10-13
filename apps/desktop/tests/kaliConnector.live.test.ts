import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { KaliConnector } from "../src/main/kali/connector";
import type { KaliEnvironment, KaliOutputEvent } from "../src/shared/kali";

// Explicit opt-in; no endpoint, credentials, or automatic VM deployment in CI.
const profilePath = process.env.PRIVORA_KALI_TEST_PROFILE;
const connect = async () => new KaliConnector(JSON.parse(
  await fs.readFile(profilePath!, "utf8"),
) as KaliEnvironment);
const projectId = "smoke-" + randomUUID().slice(0, 8);
const request = (argv: string[], timeoutSeconds = 20) => ({
  projectId, argv, timeoutSeconds, idempotencyKey: randomUUID(),
});
const collect = () => {
  const stdout = new StringDecoder("utf8");
  const stderr = new StringDecoder("utf8");
  let text = "";
  let errors = "";
  let cursor = 0;
  return {
    event: (event: KaliOutputEvent) => {
      expect(event.sequence).toBe(cursor + 1);
      cursor = event.sequence;
      if (event.stream === "stdout") text += stdout.write(Buffer.from(event.data, "base64"));
      else errors += stderr.write(Buffer.from(event.data, "base64"));
    },
    text: () => text, errors: () => errors, cursor: () => cursor,
  };
};

describe.skipIf(!profilePath)("Kali connector over real SSH", () => {
  it("discovers the guest without installing tools", async () => {
    const connector = await connect();
    const capabilities = await connector.capabilities(["python3", "nmap", "node"]);
    expect(capabilities.os).toBe("Linux");
    expect(capabilities.architecture).toBe("aarch64");
    expect(capabilities.tools.python3).toBeTruthy();
  });

  it("streams before completion and retrieves verified Unicode artifacts", async () => {
    const connector = await connect();
    const job = await connector.submit(request([
      "python3", "-c",
      "from pathlib import Path;import sys,time;print('first',flush=True);time.sleep(2);"
      + "Path('sample.txt').write_text('€ 😀 漢字');print('€ 😀 漢字',flush=True);sys.stderr.write('stderr\\n')",
    ]));
    const output = collect();
    let live = await connector.output(job.id);
    const deadline = Date.now() + 1500;
    while (!live.events.length && Date.now() < deadline) {
      await delay(100);
      live = await connector.output(job.id);
    }
    expect(live.job.state).toBe("running");
    expect(live.events.length).toBeGreaterThan(0);
    for (const event of live.events) output.event(event);
    const result = await connector.watch(job.id, {
      afterSequence: live.nextSequence, onOutput: output.event,
    });
    expect(result.state).toBe("succeeded");
    expect(output.text()).toContain("€ 😀 漢字");
    expect(output.errors()).toContain("stderr");
    const artifact = await connector.artifact(job.id, "sample.txt");
    expect(Buffer.from(artifact.data, "base64").toString("utf8")).toBe("€ 😀 漢字");
    await expect(connector.artifact(job.id, "../outside")).rejects.toThrow();
  }, 20_000);

  it("recovers after the submitting SSH connection closes without duplicate execution", async () => {
    const first = await connect();
    const specification = request([
      "python3", "-c",
      "import time;open('once.txt','a').write('one\\n');print('before',flush=True);"
      + "time.sleep(2);print('after',flush=True)",
    ]);
    const job = await first.submit(specification);
    // Every RPC uses a new SSH session. Submit has already disconnected.
    const restored = await connect();
    expect((await restored.lookup(specification.idempotencyKey))?.id).toBe(job.id);
    const duplicate = await restored.submit(specification);
    expect(duplicate.id).toBe(job.id);
    const output = collect();
    await restored.watch(job.id, { onOutput: output.event });
    expect(output.text()).toContain("before");
    expect(output.text()).toContain("after");
    const artifact = await restored.artifact(job.id, "once.txt");
    expect(Buffer.from(artifact.data, "base64").toString("utf8")).toBe("one\n");
    const finalCursor = output.cursor();
    expect((await restored.output(job.id, finalCursor)).events).toEqual([]);
  }, 20_000);

  it("confirms Stop and remains ready for the next job", async () => {
    const connector = await connect();
    const job = await connector.submit(request([
      "python3", "-c", "import time;print('started',flush=True);time.sleep(60)",
    ], 120));
    const controller = new AbortController();
    controller.abort();
    const stopped = await connector.watch(job.id, { signal: controller.signal });
    expect(stopped.state).toBe("cancelled");
    const followup = await connector.submit(request(["python3", "-c", "print('ready')"]));
    expect((await connector.watch(followup.id)).state).toBe("succeeded");
  }, 20_000);

  it("reports timeout and nonzero exit accurately", async () => {
    const connector = await connect();
    const slow = await connector.submit(request(["python3", "-c", "import time;time.sleep(60)"], 1));
    expect((await connector.watch(slow.id)).state).toBe("timed_out");
    const failed = await connector.submit(request(["python3", "-c", "raise SystemExit(7)"]));
    const result = await connector.watch(failed.id);
    expect(result.state).toBe("failed");
    expect(result.exitCode).toBe(7);
  }, 20_000);
});
