---
name: pharos-batch-executor
description: Group three independent Pharos Atlantic contract reads into one Multicall3 eth_call when deployed, otherwise one JSON-RPC HTTP array batch. Compare to three standalone calls, calculate request reduction, and report partial failure.
---
# Batch Executor Skill

Use the deployed web app or call POST /api/execute with an optional body specifying contract, account, and failMiddle (boolean).

1. Verify Pharos Atlantic chain ID 688689 and obtain a pinned block number.
2. Encode three independent SagaPlayground view actions: pending(account), deposited(account), tokenA().
3. Run and decode each action separately against the pinned block for baseline verification.
4. Check Multicall3 canonical address bytecode at the pinned block. If deployed, use aggregate3(allowFailure=true) in **one eth_call**, preserving per-call outcomes. Otherwise use a real JSON-RPC array of 3 eth_call objects in **one HTTP request**; never call it an atomic on-chain EVM transaction.
5. Compare the batch's three results to the individual results. Fail closed on any discrepancy.
6. Demonstrate partial failure with invalid method selector as action #2; actions #1 and #3 still succeed and remain independently visible.
7. Report request reduction 3→1, 66.67%, counting target action HTTP requests only (not initial validation, retries or benchmark calls); do **not** claim paid gas savings.
8. Export JSON with source mode, chain, block, action statuses, values, errors and all comparisons. No wallet connection, transaction signing or broadcasting.

This is a read-only batch executor. If an evaluator requires an on-chain state-writing multicall, this project has not claimed to provide it.
