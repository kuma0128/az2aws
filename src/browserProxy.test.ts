import { EventEmitter } from "node:events";
import type { Page } from "puppeteer-core";
import { describe, expect, it, vi } from "vitest";
import {
  authenticateBrowserProxyAsync,
  parseBrowserProxy,
} from "./browserProxy";

describe("browser proxy credentials", () => {
  it("separates and decodes credentials without putting them in the server argument", () => {
    expect(
      parseBrowserProxy("http://domain%5Cuser:p%40ss%3Aword@proxy:8080"),
    ).toEqual({
      server: "http://proxy:8080",
      credentials: { username: "domain\\user", password: "p@ss:word" },
    });
    expect(parseBrowserProxy("https://user:secret@[::1]:8443/")).toEqual({
      server: "https://[::1]:8443",
      credentials: { username: "user", password: "secret" },
    });
  });

  it.each([
    ["proxy:8080", "http://proxy:8080"],
    ["http://proxy:80", "http://proxy"],
    ["socks4://proxy:1080", "socks4://proxy:1080"],
    ["socks5://proxy:1080", "socks5://proxy:1080"],
  ])("accepts credential-free proxy %s", (input, server) => {
    expect(parseBrowserProxy(input)).toEqual({ server });
  });

  it.each([
    "http://user:secret@proxy:invalid",
    "http://user:secret%@proxy",
    "http://user:secret@proxy/path",
    "http://proxy?password=secret",
    "http://proxy#secret",
    "socks5://user:secret@proxy:1080",
    "ftp://user:secret@proxy",
  ])(
    "rejects invalid or unsupported proxies without exposing their values",
    (input) => {
      expect(() => parseBrowserProxy(input)).toThrow(
        "Invalid browser proxy URL",
      );
      try {
        parseBrowserProxy(input);
      } catch (error) {
        expect(String(error)).not.toContain("secret");
        expect(error).toHaveProperty("name", "CLIError");
      }
    },
  );

  it("only answers the configured proxy and cancels repeated attempts", async () => {
    const session = Object.assign(new EventEmitter(), {
      send: vi.fn().mockResolvedValue(undefined),
    });
    const page = {
      createCDPSession: vi.fn().mockResolvedValue(session),
    } as unknown as Page;
    await authenticateBrowserProxyAsync(
      page,
      parseBrowserProxy("http://user:secret@proxy:80"),
    );

    const challenge = (
      source: string | undefined,
      origin: string,
      requestId: string,
    ) => {
      session.emit("Fetch.authRequired", {
        requestId,
        authChallenge: { source, origin },
      });
      return session.send.mock.lastCall?.[1].authChallengeResponse;
    };
    expect(challenge("Server", "http://proxy", "server")).toEqual({
      response: "Default",
    });
    expect(challenge("Proxy", "http://other-proxy", "other")).toEqual({
      response: "Default",
    });
    expect(challenge("Proxy", "https://proxy", "scheme")).toEqual({
      response: "Default",
    });
    expect(challenge("Proxy", "invalid", "invalid")).toEqual({
      response: "Default",
    });
    expect(challenge(undefined, "http://proxy", "missing")).toEqual({
      response: "Default",
    });
    expect(challenge("Proxy", "http://proxy:80", "matching")).toEqual({
      response: "ProvideCredentials",
      username: "user",
      password: "secret",
    });
    expect(challenge("Proxy", "http://proxy", "matching")).toEqual({
      response: "CancelAuth",
    });
  });
});
