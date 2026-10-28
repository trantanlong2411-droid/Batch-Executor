# Batch Executor — Pharos Agent Arena (Medium, 100 points)

**Live app:** https://batch-executor.trantanlong2411.workers.dev/

**GitHub:** https://github.com/trantanlong2411-droid/Batch-Executor

## Verified Pharos Multicall3 execution proof

[See real Batch Executor evidence: three successful subcalls, a separate 2-success/1-failure case, pinned block results and 3-to-1 step reduction](./proof/README.md).

GitHub Actions run [40752892091](https://github.com/trantanlong2411-droid/Batch-Executor/actions/runs/40752892091) verified that Multicall3 was genuinely deployed on Pharos Atlantic, and successfully ran both scenarios using actual RPC rather than synthetic prices or placeholder results.

## Purpose

Read at least three independent Pharos Atlantic smart-contract values using one optimised batch, verify the results against the same three standalone calls at a pinned block, report request/step reduction, and demonstrate clear partial failure without losing successful results.

The testnet action list reads from an existing, public, previously tested SagaPlayground contract:

- `pending(address)` — outstanding test token B credits
- `deposited(address)` — test vault shares
- `tokenA()` — test token A contract address

All methods are **read-only**. No wallet, private key, gas payment, funds, signing or blockchain transaction is required. Never claim gas savings when only HTTP requests were reduced.

## Batching modes (honest distinctions)

The Worker first uses `eth_getCode` at the public Multicall3 canonical address on Pharos Atlantic:

`0xcA11bde05977b3631167028862bE2a173976CA11`

If code exists, it invokes `aggregate3` by one `eth_call`, passing `allowFailure=true` to retain individual results, and labels mode `MULTICALL3`. That is a genuine EVM-level read-only multicall simulation, not a transaction broadcast.

If the contract is not deployed, it sends a JSON array of three independent `eth_call` methods in one HTTP request. This is called **JSON_RPC_BATCH**. This lowers three action-level HTTP requests to one and allows per-call errors. **It is not one EVM multicall or one atomic mined transaction**. The Worker does not claim gas is saved. If the RPC does not support batch request arrays, it fails closed rather than pretending that concurrent individual calls are a batch.

All three operations use a pinned historical block, and the Worker compares each result with its standalone `eth_call`. If the values or success flags differ, `VERIFICATION_MISMATCH` fails the request.

## Reviewer walkthrough

1. Open the public website.
2. Click **Run batch · 3 successful reads**. It makes three standalone `eth_call` requests and one optimised batch, all pinned to a single Pharos Atlantic block. Inspect three successful reads, request reduction **3 → 1 (66.67%)**, and the actual batch mode.
3. Click **Demo: one failed action**. The middle action uses an explicitly invalid method selector, while two others remain valid. Confirm `PARTIAL_FAILURE_HANDLED`, two `SUCCESS`, one `FAILED`, the failed action ID and the unaffected results.
4. Inspect the full JSON trace. Each action displays its own status, value or reason.
5. Click **Export JSON evidence** for reviewer audit.

The partial-failure demo runs actual read-only Pharos calls and intentionally invalid EVM calldata. It is **not simulated fake return data**. No smart-contract state changes and no rollback is necessary for these read methods.

## Challenge coverage

| Required | Evidence |
|---|---|
| 3+ independent actions | Three different contract view methods. Each can run alone, using pinned-block state. |
| Batch, multicall or equivalent | Multicall3 aggregate3 when deployed, else one legitimate JSON-RPC HTTP batch containing 3 eth_call requests, clearly labeled as non-atomic. |
| Gas or step reduction | Measured target-action HTTP request reduction 3 to 1 (66.67%). No gas savings are claimed. Blockchain validation and baseline benchmark calls are excluded from the comparison. |
| Handles partial failure | Invalid selector in action #2 fails. Actions #1 and #3 return independently; statuses and reasons are recorded. Baseline read checks verify consistency. |

## Safety, limits and reviewer caveats

- The core uses real Pharos Atlantic testnet chain 688689 at `https://atlantic.dplabs-internal.com`; hosted Pharos MCP instead targets mainnet 1672.
- Public RPC may rate limit or reject JSON-RPC batch bodies. In those cases the request fails closed and is recorded as an error; it never substitutes fabricated data.
- A transport-level JSON-RPC batch is *not equivalent to an atomic on-chain state-writing multicall*. A reviewer requiring all actions in one EVM transaction might judge that fallback as partial credit.
- Three independent reads do not imply gas saving; eth_call does not charge gas to the user.
- A separate three-call baseline is executed **only to verify equality**, so this demonstration's whole HTTP usage is more than one request. The comparison is strictly action execution mode 3 independent HTTP calls vs one batch execution call.
- No actual transaction hash, gas receipt, or mined event exists for a read-only dry run.
- No private financial data or wallets are needed.

## Verification & continuous integration

```bash
npm install
npm test
npm run build-check
npx wrangler deploy
```

The connected GitHub ↔ Cloudflare integration automatically deploys from `main`.

[CI workflow](https://github.com/trantanlong2411-droid/Batch-Executor/actions/workflows/verify.yml) runs deterministic ABI/partial-failure tests, Worker compilation, and a **real deployed Worker** test including 3 passing reads and 2-pass/1-fail read, uploading `pharos-batch-executor-live-evidence` as a JSON file. A passing offline mock test is not claimed to prove live network connectivity.

## Primary references

- [Batch Executor task](https://pharos-agent-arena.vercel.app/tasks/batch-executor)
- [Multicall3 contract implementation and allowFailure behavior](https://github.com/mds1/multicall3)
- [Ethereum JSON-RPC specification](https://ethereum.org/en/developers/docs/apis/json-rpc/)
- [Pharos Network MCP](https://github.com/PharosNetwork/pharos-mcp)
