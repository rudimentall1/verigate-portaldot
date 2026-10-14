// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test fixture that always rejects native-token transfers.
contract RejectingRecipient {
    receive() external payable {
        revert("recipient rejects payment");
    }
}
