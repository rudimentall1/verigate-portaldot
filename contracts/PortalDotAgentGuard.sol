// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PortalDotAgentGuard
/// @notice Executes a native-token payment only when a trusted EVM bridge signer
///         has signed the exact action using EIP-712.
/// @dev The bridge must verify Verigate's Ed25519 execution authorization off-chain.
///      This contract does not verify Ed25519.
contract PortalDotAgentGuard {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("PortalDotAgentGuard");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 private constant TRANSFER_TYPEHASH = keccak256(
        "TransferAuthorization(address recipient,uint256 amount,uint256 nonce,uint256 deadline,bytes32 actionId)"
    );
    uint256 private constant MAX_AUTHORIZATION_TTL = 300;
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    address public immutable authoritySigner;
    mapping(uint256 => bool) public usedNonces;
    bool private entered;

    error ZeroAuthoritySigner();
    error InvalidRecipient();
    error InvalidAmount();
    error AuthorizationExpired();
    error AuthorizationTooFarInFuture();
    error NonceAlreadyUsed(uint256 nonce);
    error InvalidSignature();
    error InvalidAuthoritySignature();
    error InsufficientBalance(uint256 available, uint256 requested);
    error NativeTransferFailed();
    error ReentrantCall();

    event Deposited(address indexed sender, uint256 amount);
    event TransferExecuted(bytes32 indexed actionId, address indexed recipient, uint256 amount, uint256 nonce);

    constructor(address authoritySigner_) {
        if (authoritySigner_ == address(0)) revert ZeroAuthoritySigner();
        authoritySigner = authoritySigner_;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Execute the exact native-token transfer authorized by the bridge.
    /// @dev Anyone may relay a valid signature. Recipient, value, chain and contract
    ///      are bound to the signature; nonces are consumed before the external call.
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

        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert AuthorizationExpired();
        if (deadline > block.timestamp + MAX_AUTHORIZATION_TTL) revert AuthorizationTooFarInFuture();
        if (usedNonces[nonce]) revert NonceAlreadyUsed(nonce);
        if (address(this).balance < amount) {
            revert InsufficientBalance(address(this).balance, amount);
        }

        digest = _authorizationDigest(recipient, amount, nonce, deadline, actionId);
        address recovered = _recover(digest, signature);
        if (recovered != authoritySigner) revert InvalidAuthoritySignature();

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
