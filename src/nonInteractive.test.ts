import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("leaves stdout empty when a credential_process login requires a password", async () => {
  const bundle = await build({
    stdin: {
      contents: `import {states} from './src/loginStates';
        console.log = () => {};
        states.find(state => state.name === 'password input').handler(
          {$: async () => null}, {}, true, '', undefined, false, false, true
        ).catch(error => { process.stderr.write(error.message); process.exitCode = 2; });`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
  });
  // Real Inquirer and piped stdin/stdout: mocking console.log cannot hide a
  // prompt that writes directly to stdout.
  const child = spawnSync(process.execPath, ["-"], {
    input: bundle.outputFiles[0].text,
    encoding: "utf8",
    timeout: 5_000,
  });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(2);
  expect(child.stdout).toBe("");
  expect(child.stderr).toContain("Authentication requires user input");
});
