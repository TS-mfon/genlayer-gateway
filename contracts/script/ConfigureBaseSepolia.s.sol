// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LayerZeroGatewaySender } from "../src/transport/LayerZeroGatewaySender.sol";
import { LayerZeroResultReceiver } from "../src/transport/LayerZeroResultReceiver.sol";

interface VmConfigureBase {
    function envAddress(string calldata) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract ConfigureBaseSepolia {
    VmConfigureBase private constant vm =
        VmConfigureBase(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        require(block.chainid == 84_532, "Base Sepolia only");
        address genLayerGateway = vm.envAddress("GENLAYER_GATEWAY_ADDRESS");
        LayerZeroGatewaySender sender = LayerZeroGatewaySender(vm.envAddress("BASE_SENDER_ADDRESS"));
        LayerZeroResultReceiver receiver =
            LayerZeroResultReceiver(vm.envAddress("BASE_RESULT_RECEIVER_ADDRESS"));

        vm.startBroadcast();
        sender.setTargetGenLayerReceiver(genLayerGateway);
        receiver.setTrustedGenLayerSender(genLayerGateway);
        vm.stopBroadcast();
    }
}
