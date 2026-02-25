import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function sh(cmd, env) {
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

  sh(`npx tsx apps/client-cli/write-memory.ts ./example/memory.json ${agentId} ${pass}`);
  sh(`npx tsx apps/client-cli/read-memory.ts 0 ${pass}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
