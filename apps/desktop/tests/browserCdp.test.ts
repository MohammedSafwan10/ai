import { describe, expect, it, vi } from "vitest";
import { BrowserCdpClient } from "../src/main/browser/browserCdp";

describe("browser CDP lifecycle", () => {
  it("re-enables protocol domains after an external debugger detach", async () => {
    let attached = false;
    const sendCommand = vi.fn(async () => ({}));
    const contents = {
      isDestroyed: () => false,
      debugger: {
        isAttached: () => attached,
        attach: vi.fn(() => { attached = true; }),
        detach: vi.fn(() => { attached = false; }),
        sendCommand,
      },
    };
    const client = new BrowserCdpClient(contents as never);

    await client.enableNetwork();
    attached = false;
    await client.enableNetwork();

    expect(sendCommand).toHaveBeenCalledTimes(2);
    expect(sendCommand).toHaveBeenNthCalledWith(1, "Network.enable", undefined);
    expect(sendCommand).toHaveBeenNthCalledWith(2, "Network.enable", undefined);
  });
});
