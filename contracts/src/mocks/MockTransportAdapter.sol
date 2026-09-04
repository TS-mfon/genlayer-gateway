// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouter } from "../GatewayRouter.sol";
import { ITransportAdapter } from "../interfaces/ITransportAdapter.sol";

contract MockTransportAdapter is ITransportAdapter {
    uint256 public deliveryFee;
    uint256 public dispatchCount;
    bytes public lastPayload;
    GatewayRouter public router;

    constructor(uint256 initialDeliveryFee) {
        deliveryFee = initialDeliveryFee;
    }

    function setRouter(address gatewayRouter) external {
        router = GatewayRouter(gatewayRouter);
    }

    function setDeliveryFee(uint256 newFee) external {
        deliveryFee = newFee;
    }

    function quoteDispatch(bytes calldata) external view returns (uint256) {
        return deliveryFee;
    }

    function dispatch(bytes calldata payload) external payable returns (bytes32 messageId) {
        require(msg.value == deliveryFee, "fee");
        lastPayload = payload;
        messageId = keccak256(abi.encode(++dispatchCount, payload));
    }

    function deliverResult(
        bytes32 requestId,
        uint8 decision,
        bytes32 evidenceHash,
        bytes32 policyHash
    ) external {
        router.handleResult(
            requestId,
            decision,
            evidenceHash,
            policyHash,
            keccak256(abi.encode(requestId, decision))
        );
    }
}
