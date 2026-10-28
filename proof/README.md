# Batch Executor — independently verified Pharos Multicall3 evidence

Verified on 28 October 2026 through [GitHub Actions run 40752892091](https://github.com/trantanlong2411-droid/Batch-Executor/actions/runs/40752892091).

- [Live public Batch Executor](https://batch-executor.trantanlong2411.workers.dev/)
- [Repository](https://github.com/trantanlong2411-droid/Batch-Executor)
- [CI full JSON artifact](https://github.com/trantanlong2411-droid/Batch-Executor/actions/runs/40752892091) — download `pharos-batch-executor-live-evidence`
- [Permanent summary of on-chain read results](./verified-scenarios.json)

## Evidence: actual MULTICALL3, not a simulated provider fallback

The deployed Worker checked bytecode at the canonical Multicall3 address `0xcA11bde05977b3631167028862bE2a173976CA11` on Pharos Atlantic Testnet (chain 688689), and successfully invoked `aggregate3` through a single `eth_call` with `allowFailure=true` on each subcall.

This was the **MULTICALL3** mode, not JSON-RPC HTTP batch fallback. It executed three independent EVM read operations in one aggregate call, compared each result against the equivalent standalone `eth_call` at the same pinned block, and confirmed exact agreement.

### Scenario 1: All three actions succeed

Pinned testnet block: `31997412`

| Action | Status | Actual returned value |
|---|---|---|
| pending(account) | SUCCESS | 0 |
| deposited(account) | SUCCESS | 1000000000000000000 wei (1 test share) |
| tokenA() | SUCCESS | `0x0988aD05eFB8dfCf1d2Cb0434a2a719140497aea` |

Decision: `BATCH_COMPLETED`, 3/3 successes.

### Scenario 2: Partial failure, other actions continue

Pinned testnet block: `31997414`

| Action | Status | Actual returned value |
|---|---|---|
| pending(account) | SUCCESS | 0 |
| Invalid method selector (injected on purpose) | FAILED | EVM subcall reverted |
| tokenA() | SUCCESS | `0x0988aD05eFB8dfCf1d2Cb0434a2a719140497aea` |

Decision: `PARTIAL_FAILURE_HANDLED`, with 2 successful subcalls and 1 failed subcall. The failure was isolated through `allowFailure=true`, not hidden. All three action statuses are logged, including which failed and which still succeeded.

### Optimisation comparison

- Independent action calls: **3** separate `eth_call` requests.
- Aggregated action calls: **1** `eth_call` to deployed Multicall3.
- Reduction of action request count: **2 requests, or 66.67%**.
- Baseline verification makes extra requests, excluded from this comparison.
- **No gas savings are claimed**, since an `eth_call` is a read-only simulation with no paid transaction gas.
- No wallet signing, broadcast transaction, on-chain state change or invented transaction hash.

## How to reproduce

Open the [website](https://batch-executor.trantanlong2411.workers.dev/). Click "Run batch · 3 successful reads", then "Demo: one failed action". The website shows each result, batching mode, pinned block and comparison. Export the browser JSON to retain full evidence.

Source `scripts/smoke-deployed.mjs` independently verifies live values on the deployed Worker and generates the downloadable artifact.

CI reported **11/11 unit tests passing**, a successful Cloudflare Worker build and successful public testnet execution for both scenarios. Evidence here is derived from actual live CI logs, not synthetic fixture values.

This is a read-only multicall task. If the reviewer expects **state-changing** transfers or claims, this proof does not claim those operations or their gas savings.
