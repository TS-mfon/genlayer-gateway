// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IGatewayCallback {
    function onGatewayResult(
        bytes32 requestId,
        uint8 decision,
        bytes32 evidenceHash,
        bytes32 policyHash
    ) external;
}
