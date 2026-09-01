import http from "node:http";
import { URL } from "node:url";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
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

async function startFakeIdpAsync(): Promise<{
  origin: string;
  state: FakeIdpState;
  closeAsync: () => Promise<void>;
}> {
  const state: FakeIdpState = {
    inflatedSamlRequest: "",
    receivedUsername: "",
    receivedPassword: "",
    receivedKmsiChoice: "",
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      if (req.method === "GET" && url.pathname === `/${TENANT_ID}/saml2`) {
        const samlRequest = url.searchParams.get("SAMLRequest") ?? "";
        state.inflatedSamlRequest = zlib
          .inflateRawSync(Buffer.from(samlRequest, "base64"))
          .toString("utf8");
        res.writeHead(200, { "content-type": "text/html" });
        res.end(
          htmlPage(`
            <form method="POST" action="/password">
              <input type="email" name="loginfmt" value="">
              <input type="submit" value="Next">
            </form>
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
    })().catch((error: unknown) => {
      res.writeHead(500);
      res.end(String(error));
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

describe.skipIf(!systemBrowser)("login local e2e (fake IdP)", () => {
  it(
    "drives the login state machine in a real browser and captures the SAML response",
    async () => {
      const fakeIdp = await startFakeIdpAsync();

      try {
        const realLoginUrl = await login._createLoginUrlAsync(
          APP_ID_URI,
          TENANT_ID,
          "https://signin.aws.amazon.com/saml",
        );
        const loginUrl = realLoginUrl.replace(
          "https://login.microsoftonline.com",
          fakeIdp.origin,
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
      } finally {
        await fakeIdp.closeAsync();
      }
    },
    120 * 1000,
  );
});
