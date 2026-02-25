import { ethers } from 'hardhat';

/**
 * Usage:
 *   AGENT_ID=0x... WRITER=0x... LEDGER=0x... npx hardhat run scripts/allow-writer.ts --network sepolia
 */
async function main() {
  const agentId = process.env.AGENT_ID;
  const writer = process.env.WRITER;
  const ledgerAddr = process.env.LEDGER;

  if (!agentId || !writer || !ledgerAddr) {
    throw new Error('Missing AGENT_ID, WRITER, or LEDGER env vars');
  }

  const [owner] = await ethers.getSigners();
  const ledger = await ethers.getContractAt('MemoryLedger', ledgerAddr, owner);
  const tx = await ledger.setWriterAllowed(agentId, writer, true);
  console.log('setWriterAllowed tx:', tx.hash);
  await tx.wait();
  console.log('writer allowed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
