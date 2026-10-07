import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { paths } from "./paths";
import { URL } from "node:url";
import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import puppeteer, { type Browser } from "puppeteer-core";
import { login } from "./login";
import { detectSystemChromeAsync } from "./systemChrome";

/**
 * End-to-end regression test against a local fake IdP.
 *
 * A tiny HTTP server mimics the Microsoft Entra ID login page states that the
 * CLI state machine drives (username -> password -> "stay signed in"), then
 * auto-POSTs a SAMLResponse to the real AWS SAML endpoint URL. az2aws
 * intercepts that request inside the browser before it leaves the machine, so
 * the test exercises the real system browser, the login state machine, and
 * the SAML capture path without any external network traffic or credentials.
 *
 * Requires an installed Chromium-based browser; skipped when none is found.
 */

const systemBrowser =
  process.env.BROWSER_CHROME_BIN || (await detectSystemChromeAsync());

const TENANT_ID = "e2e-tenant";
const APP_ID_URI = "https://signin.aws.amazon.com/saml#local-e2e";
const USERNAME = "user@example.com";
const PASSWORD = "correct horse battery staple";
const ROLE_ARN = "arn:aws:iam::123456789012:role/LocalE2eRole";
const PRINCIPAL_ARN =
  "arn:aws:iam::123456789012:saml-provider/LocalE2eProvider";

const SAML_ASSERTION_XML = `
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
  <Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion">
    <AttributeStatement>
      <Attribute Name="https://aws.amazon.com/SAML/Attributes/Role">
        <AttributeValue>${ROLE_ARN},${PRINCIPAL_ARN}</AttributeValue>
      </Attribute>
    </AttributeStatement>
  </Assertion>
</samlp:Response>
`;

interface FakeIdpState {
  inflatedSamlRequest: string;
  receivedUsername: string;
  receivedPassword: string;
  receivedKmsiChoice: string;
  receivedOriginAuthorization: string[];
}

function htmlPage(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fake Entra</title></head><body>${body}</body></html>`;
}

function readBodyAsync(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString("utf8")));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function startFakeIdpAsync(probeOriginAuth = false): Promise<{
  origin: string;
  state: FakeIdpState;
  closeAsync: () => Promise<void>;
}> {
  const state: FakeIdpState = {
    inflatedSamlRequest: "",
    receivedUsername: "",
    receivedPassword: "",
    receivedKmsiChoice: "",
    receivedOriginAuthorization: [],
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      if (url.pathname === "/origin-auth") {
        state.receivedOriginAuthorization.push(req.headers.authorization ?? "");
        res.writeHead(401, { "www-authenticate": 'Basic realm="origin"' });
        res.end("unauthorized");
        return;
      }

      if (req.method === "GET" && url.pathname === `/${TENANT_ID}/saml2`) {
        const samlRequest = url.searchParams.get("SAMLRequest") ?? "";
        state.inflatedSamlRequest = zlib
          .inflateRawSync(Buffer.from(samlRequest, "base64"))
          .toString("utf8");
        res.writeHead(200, { "content-type": "text/html" });
        res.end(
          htmlPage(`
            <form method="POST" action="/password" ${probeOriginAuth ? "hidden" : ""}>
              <input type="email" name="loginfmt" value="">
              <input type="submit" value="Next">
            </form>
            ${probeOriginAuth ? '<script>fetch("/origin-auth", {signal: AbortSignal.timeout(500)}).catch(() => {}).finally(() => document.forms[0].hidden = false);</script>' : ""}
          `),
        );
        return;
      }

      if (req.method === "POST" && url.pathname === "/password") {
        const body = new URLSearchParams(await readBodyAsync(req));
        state.receivedUsername = body.get("loginfmt") ?? "";
        res.writeHead(200, { "content-type": "text/html" });
        res.end(
          htmlPage(`
            <form method="POST" action="/kmsi">
              <input type="password" name="passwd" value="">
              <input type="submit" value="Sign in">
            </form>
          `),
        );
        return;
      }

      if (req.method === "POST" && url.pathname === "/kmsi") {
        const body = new URLSearchParams(await readBodyAsync(req));
        state.receivedPassword = body.get("passwd") ?? "";
        res.writeHead(200, { "content-type": "text/html" });
        res.end(
          htmlPage(`
            <div id="KmsiDescription">Stay signed in?</div>
            <form method="POST" action="/finish">
              <input type="submit" id="idBtn_Back" name="kmsi" value="No">
              <input type="submit" id="idSIButton9" name="kmsi" value="Yes">
            </form>
          `),
        );
        return;
      }

      if (req.method === "POST" && url.pathname === "/finish") {
        const body = new URLSearchParams(await readBodyAsync(req));
        state.receivedKmsiChoice = body.get("kmsi") ?? "";
        const samlResponse = Buffer.from(SAML_ASSERTION_XML).toString("base64");
        res.writeHead(200, { "content-type": "text/html" });
        res.end(
          htmlPage(`
            <form method="POST" action="https://signin.aws.amazon.com/saml">
              <input type="hidden" name="SAMLResponse" value="${samlResponse}">
            </form>
            <script>document.forms[0].submit();</script>
          `),
        );
        return;
      }

      res.writeHead(404);
      res.end("not found");
    })().catch(() => {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("internal server error");
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unexpected server address");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    state,
    closeAsync: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function startAuthenticatedProxyAsync(target: string) {
  const username = "proxy-user";
  const password = "p@ss:word";
  const expectedAuthorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  let authenticatedRequests = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://idp.example.test");
    if (url.hostname !== "idp.example.test") {
      res.writeHead(502).end();
      return;
    }
    if (req.headers["proxy-authorization"] !== expectedAuthorization) {
      res.writeHead(407, { "proxy-authenticate": 'Basic realm="proxy"' });
      res.end();
      return;
    }
    authenticatedRequests++;
    const headers = { ...req.headers };
    delete headers["proxy-authorization"];
    const upstream = http.request(
      new URL(url.pathname + url.search, target),
      {
        method: req.method,
        headers,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  server.on("connect", (_req, socket) =>
    socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Unexpected proxy address");
  return {
    url: `http://${username}:${encodeURIComponent(password)}@127.0.0.1:${address.port}`,
    server: `http://127.0.0.1:${address.port}`,
    authenticatedRequests: () => authenticatedRequests,
    closeAsync: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe.skipIf(!systemBrowser)("login local e2e (fake IdP)", () => {
  it.each([
    { proxy: false, incognito: false },
    { proxy: true, incognito: false },
    { proxy: true, incognito: true },
  ])(
    "captures SAML without exposing CDP or proxy credentials (proxy=$proxy, incognito=$incognito)",
    async ({ proxy: useProxy, incognito }) => {
      const fakeIdp = await startFakeIdpAsync(useProxy);
      const proxy = useProxy
        ? await startAuthenticatedProxyAsync(fakeIdp.origin)
        : undefined;
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      for (const key of [
        "https_proxy",
        "HTTPS_PROXY",
        "http_proxy",
        "HTTP_PROXY",
      ])
        delete process.env[key];
      if (proxy) process.env.https_proxy = proxy.url;
      const launch = puppeteer.launch.bind(puppeteer);
      let launchedBrowser: Browser | undefined;
      const launchSpy = vi
        .spyOn(puppeteer, "launch")
        .mockImplementation(async (options) => {
          launchedBrowser = await launch(options);
          return launchedBrowser;
        });

      try {
        const realLoginUrl = await login._createLoginUrlAsync(
          APP_ID_URI,
          TENANT_ID,
          "https://signin.aws.amazon.com/saml",
        );
        const loginUrl = realLoginUrl.replace(
          "https://login.microsoftonline.com",
          proxy ? "http://idp.example.test" : fakeIdp.origin,
        );

        const samlResponse = await login._performLoginAsync(
          loginUrl,
          true, // headless
          true, // disableSandbox: CI containers restrict user namespaces
          true, // cliProxy: drive the pages through the state machine
          true, // noPrompt
          false, // enableChromeNetworkService
          USERNAME,
          PASSWORD,
          false, // enableChromeSeamlessSso
          false, // rememberMe: no persistent profile in tests
          false, // noDisableExtensions
          false, // disableGpu
          incognito,
        );

        // The SAMLRequest reaching the IdP was a valid deflated AuthnRequest.
        expect(fakeIdp.state.inflatedSamlRequest).toContain(APP_ID_URI);
        expect(fakeIdp.state.inflatedSamlRequest).toContain(
          "https://signin.aws.amazon.com/saml",
        );

        // The state machine filled the login pages.
        expect(fakeIdp.state.receivedUsername).toBe(USERNAME);
        expect(fakeIdp.state.receivedPassword).toBe(PASSWORD);
        expect(fakeIdp.state.receivedKmsiChoice).toBe("No");

        // The SAML POST was captured before leaving the browser.
        const roles = login._parseRolesFromSamlResponse(samlResponse);
        expect(roles).toEqual([
          { roleArn: ROLE_ARN, principalArn: PRINCIPAL_ARN },
        ]);

        // Inspect the actual browser transport, not just the launch options.
        expect(launchedBrowser?.wsEndpoint()).toBe("");
        const browserArgs = launchedBrowser?.process()?.spawnargs ?? [];
        expect(browserArgs).toContain("--remote-debugging-pipe");
        expect(
          browserArgs.some((arg) => arg.startsWith("--remote-debugging-port")),
        ).toBe(false);
        if (proxy) {
          expect(browserArgs).toContain(`--proxy-server=${proxy.server}`);
          expect(browserArgs.join(" ")).not.toContain("proxy-user");
          expect(browserArgs.join(" ")).not.toContain("p@ss:word");
          expect(browserArgs.join(" ")).not.toContain("p%40ss%3Aword");
          expect(proxy.authenticatedRequests()).toBeGreaterThan(0);
          expect(
            fakeIdp.state.receivedOriginAuthorization.length,
          ).toBeGreaterThan(0);
          expect(
            fakeIdp.state.receivedOriginAuthorization.every(
              (value) => value === "",
            ),
          ).toBe(true);
        }
      } finally {
        process.env = originalEnv;
        launchSpy.mockRestore();
        await proxy?.closeAsync();
        await fakeIdp.closeAsync();
      }
    },
    120 * 1000,
  );
  it("serializes real browsers sharing a remembered profile and waits for shutdown", async () => {
    const fakeIdp = await startFakeIdpAsync();
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "az2aws-browser-lock-e2e-"),
    );
    const originalPaths = { ...paths };
    paths.chromium = path.join(directory, "chromium");
    paths.userDataDir = undefined;
    paths.profileDir = undefined;
    try {
      const loginUrl = (
        await login._createLoginUrlAsync(
          APP_ID_URI,
          TENANT_ID,
          "https://signin.aws.amazon.com/saml",
        )
      ).replace("https://login.microsoftonline.com", fakeIdp.origin);
      const run = () =>
        login._performLoginAsync(
          loginUrl,
          true,
          true,
          true,
          true,
          false,
          USERNAME,
          PASSWORD,
          false,
          true,
          false,
          false,
        );
      const results = await Promise.all([run(), run()]);
      for (const assertion of results)
        expect(login._parseRolesFromSamlResponse(assertion)).toEqual([
          { roleArn: ROLE_ARN, principalArn: PRINCIPAL_ARN },
        ]);
      // Closing before returning must release Chromium's profile, including on Windows.
      await fs.rm(paths.chromium, { recursive: true });
    } finally {
      Object.assign(paths, originalPaths);
      await fakeIdp.closeAsync();
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
