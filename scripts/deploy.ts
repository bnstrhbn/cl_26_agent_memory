import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const Factory = await ethers.getContractFactory('MemoryLedger');
  const ledger = await Factory.deploy(deployer.address);
  await ledger.waitForDeployment();

  const addr = await ledger.getAddress();
  console.log('MemoryLedger deployed to:', addr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
