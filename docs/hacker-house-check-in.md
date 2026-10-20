# Hacker House check-in status

Updated: 20 October 2026

The current event listing previously showed the check-in deadline as 24 October 2026, 20:00 UTC+8 (12:00 UTC; 14:00 in Frankfurt) and final submission/code freeze as 6 November 2026, 12:00 UTC+8 (04:00 UTC). Reconfirm current requirements and deadlines on the [official DoraHacks listing](https://dorahacks.io/hackathon/2362/detail) and [PortalDot Discord](https://discord.gg/portaldot) before submitting.

## Current progress

- Public repository: https://github.com/rudimentall1/verigate-portaldot
- PortalDot V3 testnet contract deployed: `0x3f2f484484fbE6e224d058fDfDB6B5A14F09655b`.
- Successful deployment transaction: `0xb1cf9cca75bb029b0a723f13c398479d2c18704c1138c02c6d92a02c1fcdce3c`, receipt status `0x1`, block `116872`.
- Runtime bytecode fingerprint and authority signer readback recorded in [deployment evidence](deployment-evidence-2026-10-20.md).
- Guarded transfer executor validates the signed authorization and deployment identity; dry-run is default and broadcast is explicit opt-in in the deployment workspace.
- 156 tests passed in the deployment workspace.

## Remaining before final submission

1. Publish/review the guarded transfer executor and required dependency changes on the public default branch.
2. Record a demo under three minutes, distinguishing local Hardhat transfer evidence from the public testnet deployment.
3. Complete the DoraHacks check-in and final submission forms.
4. Keep the EVM-to-SS58 mapping caveat visible; it has not been independently confirmed for the displayed wallet address.

## Honest limitations

- The contract deployment is confirmed on PortalDot V3 testnet. This is not evidence of a public token transfer.
- End-to-end ALLOW/BLOCK transfer execution was demonstrated on a temporary loopback Hardhat EVM.
- The EVM-to-SS58 mapping for the displayed wallet address is not independently verified.
- The project is a testnet prototype, not an independent audit or production-ready key-management system.

## Checklist

- [x] Public GitHub repository and updated README
- [x] Deployment receipt, runtime-code fingerprint and authority-signer readback documented
- [x] Testnet operations runbook published
- [x] Check-in submission draft updated
- [ ] Reproducible transfer tooling published on the default branch
- [ ] Demo video recorded and linked
- [ ] DoraHacks check-in submitted
- [ ] Final DoraHacks submission completed
