// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IGatewayBytesCallback {
    function onGatewayResult(
        bytes32 requestId,
        bytes32 routeId,
        bytes32 resultTxHash,
        bytes calldata result
    ) external;
}
