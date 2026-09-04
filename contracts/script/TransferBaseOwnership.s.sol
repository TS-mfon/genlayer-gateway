// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouter } from "../src/GatewayRouter.sol";
import { LayerZeroGatewaySender } from "../src/transport/LayerZeroGatewaySender.sol";
import { LayerZeroResultReceiver } from "../src/transport/LayerZeroResultReceiver.sol";

interface VmTransferBase {
    function envAddress(string calldata) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract TransferBaseOwnership {
    VmTransferBase private constant vm =
        VmTransferBase(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        require(block.chainid == 84_532, "Base Sepolia only");
        address protocolOwner = vm.envAddress("PROTOCOL_OWNER");
        vm.startBroadcast();
        LayerZeroGatewaySender(vm.envAddress("BASE_SENDER_ADDRESS"))
            .transferOwnership(protocolOwner);
        LayerZeroResultReceiver(vm.envAddress("BASE_RESULT_RECEIVER_ADDRESS"))
            .transferOwnership(protocolOwner);
        GatewayRouter(vm.envAddress("BASE_GATEWAY_ROUTER_ADDRESS")).transferOwnership(protocolOwner);
        vm.stopBroadcast();
    }
}
