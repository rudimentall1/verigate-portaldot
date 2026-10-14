// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPortalDotAgentGuard {
    function executeTransfer(
        address recipient,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes32 actionId,
        bytes calldata signature
    ) external returns (bytes32 digest);
}

/// @dev Test-only recipient that attempts to replay the same authorization from receive().
contract ReentrantRecipient {
    IPortalDotAgentGuard public immutable guard;
    address public payoutRecipient;
    uint256 public payoutAmount;
    uint256 public payoutNonce;
    uint256 public payoutDeadline;
    bytes32 public payoutActionId;
    bytes public payoutSignature;
    bool public reentryBlocked;

    constructor(address guard_) {
        guard = IPortalDotAgentGuard(guard_);
    }

    function configure(
        address recipient_,
        uint256 amount_,
        uint256 nonce_,
        uint256 deadline_,
        bytes32 actionId_,
        bytes calldata signature_
    ) external {
        payoutRecipient = recipient_;
        payoutAmount = amount_;
        payoutNonce = nonce_;
        payoutDeadline = deadline_;
        payoutActionId = actionId_;
        payoutSignature = signature_;
        reentryBlocked = false;
    }

    receive() external payable {
        (bool success, ) = address(guard).call(
            abi.encodeWithSelector(
                guard.executeTransfer.selector,
                payoutRecipient,
                payoutAmount,
                payoutNonce,
                payoutDeadline,
                payoutActionId,
                payoutSignature
            )
        );
        reentryBlocked = !success;
    }
}
