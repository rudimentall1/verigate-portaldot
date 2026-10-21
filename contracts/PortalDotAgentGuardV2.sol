// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PortalDotAgentGuardV2
/// @notice Native POT spending guard with an admin-controlled recipient allowlist and caps.
/// @dev Verigate Ed25519 authorization is verified off-chain by the bridge. This contract
///      verifies only the bridge's EIP-712 signature; compromise of that signer is bounded
///      by the on-chain recipient and spending policies.
contract PortalDotAgentGuardV2 {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("PortalDotAgentGuardV2");
    bytes32 private constant VERSION_HASH = keccak256("2");
    bytes32 private constant TRANSFER_TYPEHASH = keccak256(
        "TransferAuthorization(address recipient,uint256 amount,uint256 nonce,uint256 deadline,bytes32 actionId)"
    );
    uint256 public constant MAX_AUTHORIZATION_TTL = 300;
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    address public immutable admin;
    address public immutable authoritySigner;
    mapping(address => bool) public allowedRecipients;
    mapping(uint256 => bool) public usedNonces;
    uint256 public maxPerTransfer;
    uint256 public windowLimit;
    uint256 public windowSeconds;
    uint256 public windowStart;
    uint256 public spentInWindow;
    bool private entered;

    error ZeroAddress();
    error AdminMustDifferFromSigner();
    error UnauthorizedAdmin();
    error InvalidRecipient();
    error InvalidAmount();
    error AmountExceedsCap(uint256 amount, uint256 cap);
    error WindowLimitExceeded(uint256 spent, uint256 requested, uint256 cap);
    error InvalidPolicy();
    error AuthorizationExpired();
    error AuthorizationTooFarInFuture();
    error NonceAlreadyUsed(uint256 nonce);
    error InvalidSignature();
    error InvalidAuthoritySignature();
    error InsufficientBalance(uint256 available, uint256 requested);
    error NativeTransferFailed();
    error ReentrantCall();

    event Deposited(address indexed sender, uint256 amount);
    event RecipientPermissionUpdated(address indexed recipient, bool allowed);
    event SpendingPolicyUpdated(uint256 maxPerTransfer, uint256 windowLimit, uint256 windowSeconds);
    event TransferExecuted(bytes32 indexed actionId, address indexed recipient, uint256 amount, uint256 nonce);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedAdmin();
        _;
    }

    constructor(
        address admin_,
        address authoritySigner_,
        address initialRecipient_,
        uint256 maxPerTransfer_,
        uint256 windowLimit_,
        uint256 windowSeconds_
    ) {
        if (admin_ == address(0) || authoritySigner_ == address(0) || initialRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        if (admin_ == authoritySigner_) revert AdminMustDifferFromSigner();
        if (maxPerTransfer_ == 0 || windowLimit_ < maxPerTransfer_ || windowSeconds_ == 0) {
            revert InvalidPolicy();
        }
        admin = admin_;
        authoritySigner = authoritySigner_;
        maxPerTransfer = maxPerTransfer_;
        windowLimit = windowLimit_;
        windowSeconds = windowSeconds_;
        windowStart = block.timestamp;
        allowedRecipients[initialRecipient_] = true;
        emit RecipientPermissionUpdated(initialRecipient_, true);
        emit SpendingPolicyUpdated(maxPerTransfer_, windowLimit_, windowSeconds_);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function setRecipientAllowed(address recipient, bool allowed) external onlyAdmin {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        allowedRecipients[recipient] = allowed;
        emit RecipientPermissionUpdated(recipient, allowed);
    }

    function setSpendingPolicy(
        uint256 maxPerTransfer_,
        uint256 windowLimit_,
        uint256 windowSeconds_
    ) external onlyAdmin {
        if (maxPerTransfer_ == 0 || windowLimit_ < maxPerTransfer_ || windowSeconds_ == 0) {
            revert InvalidPolicy();
        }
        maxPerTransfer = maxPerTransfer_;
        windowLimit = windowLimit_;
        windowSeconds = windowSeconds_;
        // Start the newly configured policy with a clean accounting window.
        windowStart = block.timestamp;
        spentInWindow = 0;
        emit SpendingPolicyUpdated(maxPerTransfer_, windowLimit_, windowSeconds_);
    }

    function executeTransfer(
        address recipient,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes32 actionId,
        bytes calldata signature
    ) external returns (bytes32 digest) {
        if (entered) revert ReentrantCall();
        entered = true;

        if (recipient == address(0) || recipient == address(this) || !allowedRecipients[recipient]) {
            revert InvalidRecipient();
        }
        if (amount == 0) revert InvalidAmount();
        if (amount > maxPerTransfer) revert AmountExceedsCap(amount, maxPerTransfer);
        if (block.timestamp > deadline) revert AuthorizationExpired();
        if (deadline > block.timestamp + MAX_AUTHORIZATION_TTL) revert AuthorizationTooFarInFuture();
        if (usedNonces[nonce]) revert NonceAlreadyUsed(nonce);
        if (address(this).balance < amount) {
            revert InsufficientBalance(address(this).balance, amount);
        }

        uint256 currentWindowStart = windowStart;
        uint256 currentSpent = spentInWindow;
        if (block.timestamp >= currentWindowStart + windowSeconds) {
            currentWindowStart = block.timestamp;
            currentSpent = 0;
        }
        if (currentSpent + amount > windowLimit) {
            revert WindowLimitExceeded(currentSpent, amount, windowLimit);
        }

        digest = _authorizationDigest(recipient, amount, nonce, deadline, actionId);
        if (_recover(digest, signature) != authoritySigner) revert InvalidAuthoritySignature();

        // State is written before the external call. Any failed call reverts all writes.
        windowStart = currentWindowStart;
        spentInWindow = currentSpent + amount;
        usedNonces[nonce] = true;
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert NativeTransferFailed();

        entered = false;
        emit TransferExecuted(actionId, recipient, amount, nonce);
    }

    function authorizationDigest(
        address recipient,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes32 actionId
    ) external view returns (bytes32) {
        return _authorizationDigest(recipient, amount, nonce, deadline, actionId);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)
        ));
    }

    function _authorizationDigest(
        address recipient,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes32 actionId
    ) private view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_TYPEHASH, recipient, amount, nonce, deadline, actionId)
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1_HALF_ORDER) revert InvalidSignature();
        if (v == 0 || v == 1) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
