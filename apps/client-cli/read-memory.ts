#!/usr/bin/env node
/**
 * read-memory
 * Fetches a record from MemoryLedger, downloads ciphertext from IPFS, verifies keccak256,
 * then decrypts AES-256-GCM with the passphrase.
 */
import crypto from 'node:crypto';
import axios from 'axios';
import { Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function deriveKeyFromPassphrase(passphrase: string): Buffer {
  return crypto.createHash('sha256').update(passphrase, 'utf8').digest();
}

function decryptAesGcm(blob: Buffer, key: Buffer, aad: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

async function main() {
  const [,, recordId, passphrase] = process.argv;
  if (!recordId || !passphrase) {
    console.error('usage: read-memory <record-id> <passphrase>');
    process.exit(2);
  }

  const chainId = Number(process.env.CHAIN_ID || 11155111);
  const ledgerAddress = requireEnv('MEMORY_LEDGER_ADDRESS');
  const rpc = requireEnv('SEPOLIA_RPC_URL');
  const schemaVersionDefault = Number(process.env.SCHEMA_VERSION || 1);

  const provider = new JsonRpcProvider(rpc);
  const abi = [
    'function getMemory(uint256 id) view returns (tuple(address agentId,address writer,bytes32 contentHash,string pointer,string contentType,uint32 schemaVersion,uint64 createdAt,bytes32 metaHash))'
  ];
  const ledger = new Contract(ledgerAddress, abi, provider);
  const rec = await ledger.getMemory(recordId);

  const pointer: string = rec.pointer;
  if (!pointer.startsWith('ipfs://')) throw new Error(`Unsupported pointer: ${pointer}`);

  const cid = pointer.slice('ipfs://'.length);
  const gateway = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
  const url = gateway.endsWith('/') ? gateway + cid : gateway + '/' + cid;

  const resp = await axios.get(url, { responseType: 'arraybuffer' });
  const blob = Buffer.from(resp.data);

  const hash = keccak256(blob);
  if (hash.toLowerCase() !== String(rec.contentHash).toLowerCase()) {
    throw new Error(`Hash mismatch: computed ${hash} != onchain ${rec.contentHash}`);
  }

  const schemaVersion = Number(rec.schemaVersion ?? schemaVersionDefault);
  const aad = Buffer.from(
    keccak256(
      Buffer.from(toUtf8Bytes(`chainId:${chainId}|contract:${ledgerAddress.toLowerCase()}|agent:${String(rec.agentId).toLowerCase()}|schema:${schemaVersion}`))
    ).slice(2),
    'hex'
  );

  const key = deriveKeyFromPassphrase(passphrase);
  const pt = decryptAesGcm(blob, key, aad);
  process.stdout.write(pt);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
