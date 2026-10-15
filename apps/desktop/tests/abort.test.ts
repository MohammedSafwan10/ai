import { expect, it } from "vitest";
import { waitWithAbort } from "../src/main/abort";

it("stops waiting promptly and consumes a late read failure", async () => {
  const controller = new AbortController();
  let fail!: (error: Error) => void;
  const work = new Promise<void>((_resolve, reject) => { fail = reject; });
  const stopped = expect(waitWithAbort(work, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await stopped;
  fail(new Error("Late read failure"));
  await Promise.resolve();
});
