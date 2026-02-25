const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

function shCapture(cmd, env) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { env: { ...process.env, ...(env || {}) }, encoding: 'utf8' });
}

function shInherit(cmd, env) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...(env || {}) } });
}

async function main() {
  const repoRoot = process.cwd();
  const examplePath = path.join(repoRoot, 'example', 'memory.json');
  const raw = fs.readFileSync(examplePath, 'utf8');
  const stamped = raw.replace('"REPLACED_AT_RUNTIME"', `"${new Date().toISOString()}"`);
  fs.writeFileSync(examplePath, stamped);

  const agentId = process.env.AGENT_ID;
  if (!agentId) throw new Error('Missing AGENT_ID');

  const pass = `ci-${Math.random().toString(16).slice(2)}-${Date.now()}`;

  const out = shCapture(`npx tsx apps/client-cli/write-memory.ts ./example/memory.json ${agentId} ${pass}`);
  process.stdout.write(out);

  const m = out.match(/recordId:\s*(\d+)/);
  if (!m) throw new Error('Could not parse recordId from write-memory output');
  const recordId = m[1];

  shInherit(`npx tsx apps/client-cli/read-memory.ts ${recordId} ${pass}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
