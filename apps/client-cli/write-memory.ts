#!/usr/bin/env node
/**
 * write-memory
 * Encrypts a plaintext JSON file (AES-256-GCM), uploads ciphertext to IPFS via Pinata,
 * computes keccak256(ciphertextBlob), then calls MemoryLedger.commitMemory.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import axios from 'axios';
import FormData from 'form-data';
import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes, ZeroHash, Interface } from 'ethers';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function pinToIpfsPinata(blob: Buffer): Promise<{ cid: string; pointer: string }> {
  const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
  const form = new FormData();
  form.append('file', blob, { filename: 'memory.bin' });

  const headers: Record<string, string> = form.getHeaders() as any;

  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_API_SECRET;

  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  else if (apiKey && apiSecret) {
    headers['pinata_api_key'] = apiKey;
    headers['pinata_secret_api_key'] = apiSecret;
  } else {
    throw new Error('Need PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET');
  }

  try {
    const resp = await axios.post(url, form, { headers, maxBodyLength: Infinity });
    const cid = resp.data.IpfsHash as string;
    return { cid, pointer: `ipfs://${cid}` };
  } catch (e: any) {
    const status = e?.response?.status;
    const data = e?.response?.data;
    // Do not print secrets; just the Pinata error payload/status.
    console.error('Pinata upload failed', { status, data });
    throw e;
  }
}

function deriveKeyFromPassphrase(passphrase: string, salt: Buffer): Buffer {
  // Use scrypt for passphrase->key derivation (MVP hardening vs raw SHA-256).
  // Params chosen for quick CI; can be increased for production.
  return crypto.scryptSync(passphrase, salt, 32, { N: 1 << 14, r: 8, p: 1 });
}

function encryptAesGcm(plaintext: Buffer, key: Buffer, aad: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // blob format: iv(12) | tag(16) | ciphertext
  return Buffer.concat([iv, tag, ct]);
}

async function main() {
  const [,, filePath, agentId, passphrase] = process.argv;
  if (!filePath || !agentId || !passphrase) {
    console.error('usage: write-memory <json-file> <agentAddress> <passphrase>');
    process.exit(2);
  }

  const plaintext = fs.readFileSync(filePath);
  const ledgerAddress = requireEnv('MEMORY_LEDGER_ADDRESS');
  const salt = Buffer.from(`cl_26_agent_memory:${ledgerAddress.toLowerCase()}:${agentId.toLowerCase()}`, 'utf8');
  const key = deriveKeyFromPassphrase(passphrase, salt);

  const chainId = Number(process.env.CHAIN_ID || 11155111); // Sepolia default
  const schemaVersion = Number(process.env.SCHEMA_VERSION || 1);

  // AAD binds ciphertext to (chainId, contractAddress, agentId, schemaVersion)
  const aad = Buffer.from(
    keccak256(
      Buffer.concat([
        Buffer.from(toUtf8Bytes(`chainId:${chainId}|contract:${ledgerAddress.toLowerCase()}|agent:${agentId.toLowerCase()}|schema:${schemaVersion}`))
      ])
    ).slice(2),
    'hex'
  );

  const blob = encryptAesGcm(plaintext, key, aad);
  const contentHash = keccak256(blob);

  const { pointer } = await pinToIpfsPinata(blob);
  console.log('IPFS pointer:', pointer);
  console.log('contentHash:', contentHash);

  const rpc = requireEnv('SEPOLIA_RPC_URL');
  const pk = requireEnv('DEPLOYER_PRIVATE_KEY');

  const provider = new JsonRpcProvider(rpc);
  const wallet = new Wallet(pk, provider);

  const abi = [
    'function commitMemory(address agentId, bytes32 contentHash, string pointer, uint32 schemaVersion, string contentType, bytes32 metaHash) returns (uint256)',
  ];

  const ledger = new Contract(ledgerAddress, abi, wallet);
  const tx = await ledger.commitMemory(agentId, contentHash, pointer, schemaVersion, 'application/octet-stream', ZeroHash);
  console.log('commit tx:', tx.hash);
  const receipt = await tx.wait();
  console.log('confirmed in block:', receipt.blockNumber);

  // Try to extract record id from MemoryCommitted event
  try {
    const eventAbi = [
      'event MemoryCommitted(uint256 indexed id, address indexed agentId, address indexed writer, bytes32 contentHash, string pointer, uint32 schemaVersion, uint64 createdAt, bytes32 metaHash)'
    ];
    const iface = new Interface(eventAbi);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as any, data: log.data as any });
        if (parsed?.name === 'MemoryCommitted') {
          console.log('recordId:', parsed.args.id.toString());
          break;
        }
      } catch {
        // ignore non-matching logs
      }
    }
  } catch {
    // best-effort only
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
