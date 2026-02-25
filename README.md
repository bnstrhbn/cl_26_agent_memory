# cl_26_agent_memory — On-chain Agent Memory Ledger (Sepolia + IPFS) PoC

## Executive summary

This project is a minimal, hackathon-ready proof-of-concept for **consent-aware, tamper-evident agent memory**.

- **Plaintext memories** are encrypted off-chain.
- **Ciphertext** is stored in durable storage (IPFS via Pinata).
- **On-chain** we store only a *commitment* and minimal metadata: `contentHash = keccak256(ciphertext)`, plus a pointer (`ipfs://CID`), timestamps, and schema version.

This gives:
- **Integrity / verifiability:** anyone can verify the ciphertext matches the on-chain commitment.
- **Privacy / consent:** decryption keys are never stored on-chain; whoever has the key can decrypt.

## Architecture

**Data plane (off-chain, encrypted)**
- JSON memory → AES-256-GCM encrypt → ciphertext blob
- Upload blob to IPFS (Pinata)

**Control plane (on-chain ledger)**
- `MemoryLedger.sol` on **Ethereum Sepolia** stores:
  - `contentHash` (bytes32): `keccak256(ciphertextBlob)`
  - `pointer` (string): `ipfs://CID`
  - `agentId` (address)
  - `writer` (address)
  - `schemaVersion`, `createdAt`, `contentType`, optional `metaHash`

**Recall**
- Fetch record from chain → download ciphertext from IPFS → verify hash → decrypt locally.

## Threat model (MVP)

Assumptions:
- On-chain data is public.
- Storage providers may be readable by adversaries.
- Agents can be prompt-injected (do not store plaintext or raw keys in agent memory).

Protects against:
- Plaintext leakage (encryption at rest)
- Tampering (on-chain commitment hash)

Does not protect (MVP):
- Traffic analysis
- Compromised user device / key
- Advanced ZK policy proofs (roadmap)

## Quickstart

### 1) Install

```bash
npm ci
```

### 2) Configure env

Create a `.env` (do not commit):

```bash
SEPOLIA_RPC_URL=...
DEPLOYER_PRIVATE_KEY=0x...
MEMORY_LEDGER_ADDRESS=0x...   # set after deploy
PINATA_API_KEY=...
PINATA_API_SECRET=...
# optional
PINATA_JWT=...
IPFS_GATEWAY=https://ipfs.io/ipfs/
```

### 3) Deploy contract to Sepolia

```bash
npm run deploy:sepolia
```

### 4) Allow a writer for an agentId

MVP allowlist is `agentId -> writer`. The owner is the deployer.

You can call `setWriterAllowed(agentId, writer, true)` via a small script or `cast`.

### 5) Write & commit a memory

```bash
node apps/client-cli/write-memory.ts ./example/memory.json 0xAGENT_ID your-passphrase
```

### 6) Read & decrypt a memory

```bash
node apps/client-cli/read-memory.ts 0 your-passphrase
```

## Notes / roadmap

- **ERC-8004 angle:** for MVP, `agentId` is an EVM address. Later, it can become an ERC-8004 identity.
- **Key mgmt:** MVP derives key from passphrase with SHA-256 (documented). Upgrade to scrypt/argon2.
- **CRE:** optional add-on to consolidate many small memories into a daily blob and commit a single record.

## Development

```bash
npm test
```

## GitHub access / automation (important)

On this host, GitHub access is via GitHub CLI auth stored in the OS keychain:

```bash
gh auth status
# if needed
# gh auth login
```

Other agent sessions on the same host usually inherit this keychain auth. Agents on other machines will need their own `gh auth login`.
