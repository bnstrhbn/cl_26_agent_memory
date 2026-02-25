import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('MemoryLedger', function () {
  it('allows allowed writer to commit and stores record', async function () {
    const [owner, agent, writer] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory('MemoryLedger');
    const ledger = await Factory.deploy(owner.address);
    await ledger.waitForDeployment();

    // allow writer for agentId
    await (await ledger.setWriterAllowed(agent.address, writer.address, true)).wait();

    const contentHash = ethers.keccak256(ethers.toUtf8Bytes('ciphertext'));
    const pointer = 'ipfs://bafy...';

    const tx = await ledger.connect(writer).commitMemory(agent.address, contentHash, pointer, 1, 'application/octet-stream', ethers.ZeroHash);
    const receipt = await tx.wait();

    expect(receipt).to.not.equal(null);
    const total = await ledger.totalMemories();
    expect(total).to.equal(1n);

    const rec = await ledger.getMemory(0);
    expect(rec.agentId).to.equal(agent.address);
    expect(rec.writer).to.equal(writer.address);
    expect(rec.contentHash).to.equal(contentHash);
    expect(rec.pointer).to.equal(pointer);
  });
});
