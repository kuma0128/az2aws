import type { Page } from "puppeteer-core";
import { CLIError } from "./CLIError";

interface BrowserProxy {
  server: string;
  credentials?: { username: string; password: string };
}

export function parseBrowserProxy(value: string): BrowserProxy {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    if (
      !["http:", "https:", "socks4:", "socks5:"].includes(url.protocol) ||
      !url.hostname ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      throw new Error("Invalid proxy URL");
    }
    const server = `${url.protocol}//${url.host}`;
    if (!url.username && !url.password) return { server };
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported proxy authentication");
    }
    return {
      server,
      credentials: {
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      },
    };
  } catch {
    // URL/decoding errors may contain the original credential-bearing input.
    throw new CLIError(
      "Invalid browser proxy URL. Use a single HTTP, HTTPS, SOCKS4, or SOCKS5 proxy; credentials are supported only for HTTP and HTTPS proxies.",
    );
  }
}

export async function authenticateBrowserProxyAsync(
  page: Page,
  proxy: BrowserProxy,
): Promise<void> {
  if (!proxy.credentials) return;
  // Page.authenticate also answers origin-server challenges. Keep proxy
  // credentials scoped to the configured proxy instead.
  const session = await page.createCDPSession();
  const attempted = new Set<string>();
  const proxyOrigin = new URL(proxy.server).origin;
  session.on("Fetch.authRequired", (event) => {
    let matchesProxy = false;
    try {
      matchesProxy =
        event.authChallenge.source === "Proxy" &&
        new URL(event.authChallenge.origin).origin === proxyOrigin;
    } catch {
      // An unknown challenge must never receive proxy credentials.
    }
    const response = !matchesProxy
      ? { response: "Default" as const }
      : attempted.has(event.requestId)
        ? { response: "CancelAuth" as const }
        : { response: "ProvideCredentials" as const, ...proxy.credentials };
    if (matchesProxy) attempted.add(event.requestId);
    void session
      .send("Fetch.continueWithAuth", {
        requestId: event.requestId,
        authChallengeResponse: response,
      })
      .catch(() => {}); // The browser may close after the SAML response.
  });
  // Chrome requires interception for authentication. Pass requests through
  // this session; Puppeteer's separate session still captures the SAML POST.
  session.on("Fetch.requestPaused", (event) => {
    void session
      .send("Fetch.continueRequest", { requestId: event.requestId })
      .catch(() => {});
  });
  await session.send("Fetch.enable", {
    handleAuthRequests: true,
  });
}
