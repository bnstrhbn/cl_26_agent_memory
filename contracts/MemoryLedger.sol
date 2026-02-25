// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MemoryLedger (MVP)
 * @notice Stores only metadata + a commitment hash on-chain.
 *         Ciphertext lives off-chain (e.g. IPFS). Integrity is verified via contentHash.
 */
contract MemoryLedger is Ownable {
    struct MemoryRecord {
        address agentId;
        address writer;
        bytes32 contentHash;
        string pointer; // ipfs://CID or https://...
        string contentType; // e.g. application/octet-stream
        uint32 schemaVersion;
        uint64 createdAt;
        bytes32 metaHash; // optional hash of (tags/title/category)
    }

    MemoryRecord[] private _records;

    /// @dev agentId => writer => allowed
    mapping(address => mapping(address => bool)) public writerAllowlist;

    event MemoryCommitted(
        uint256 indexed id,
        address indexed agentId,
        address indexed writer,
        bytes32 contentHash,
        string pointer,
        uint32 schemaVersion,
        uint64 createdAt,
        bytes32 metaHash
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function totalMemories() external view returns (uint256) {
        return _records.length;
    }

    function getMemory(uint256 id) external view returns (MemoryRecord memory) {
        require(id < _records.length, "invalid id");
        return _records[id];
    }

    function setWriterAllowed(address agentId, address writer, bool allowed) external onlyOwner {
        writerAllowlist[agentId][writer] = allowed;
    }

    function commitMemory(
        address agentId,
        bytes32 contentHash,
        string calldata pointer,
        uint32 schemaVersion,
        string calldata contentType,
        bytes32 metaHash
    ) external returns (uint256 id) {
        require(writerAllowlist[agentId][msg.sender], "writer not allowed");

        uint64 ts = uint64(block.timestamp);
        _records.push(
            MemoryRecord({
                agentId: agentId,
                writer: msg.sender,
                contentHash: contentHash,
                pointer: pointer,
                contentType: contentType,
                schemaVersion: schemaVersion,
                createdAt: ts,
                metaHash: metaHash
            })
        );

        id = _records.length - 1;
        emit MemoryCommitted(id, agentId, msg.sender, contentHash, pointer, schemaVersion, ts, metaHash);
    }
}
