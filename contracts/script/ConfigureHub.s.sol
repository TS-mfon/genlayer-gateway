// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LayerZeroHubForwarder } from "../src/transport/LayerZeroHubForwarder.sol";
import { LayerZeroHubReceiver } from "../src/transport/LayerZeroHubReceiver.sol";

interface VmConfigureHub {
    function envAddress(string calldata) external returns (address);
    function envUint(string calldata) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract ConfigureHub {
    VmConfigureHub private constant vm =
        VmConfigureHub(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        uint32 baseEid = uint32(vm.envUint("BASE_LAYERZERO_EID"));
        LayerZeroHubReceiver receiver = LayerZeroHubReceiver(vm.envAddress("HUB_RECEIVER_ADDRESS"));
        LayerZeroHubForwarder forwarder =
            LayerZeroHubForwarder(vm.envAddress("HUB_FORWARDER_ADDRESS"));
        bytes32 baseSender = bytes32(uint256(uint160(vm.envAddress("BASE_SENDER_ADDRESS"))));
        bytes32 baseReceiver =
            bytes32(uint256(uint160(vm.envAddress("BASE_RESULT_RECEIVER_ADDRESS"))));
        address genLayerGateway = vm.envAddress("GENLAYER_GATEWAY_ADDRESS");
        address baseRouter = vm.envAddress("BASE_GATEWAY_ROUTER_ADDRESS");
        address hubReceiverAddress = vm.envAddress("HUB_RECEIVER_ADDRESS");

        vm.startBroadcast();
        receiver.setTrustedSender(baseEid, baseSender);
        forwarder.setDestination(baseEid, baseReceiver);
        forwarder.setTrustedGenLayerSender(genLayerGateway);
        forwarder.setTrustedOriginRouter(baseRouter);
        forwarder.setHubReceiver(hubReceiverAddress);
        forwarder.setResultAttestor(vm.envAddress("RESULT_ATTESTOR_ADDRESS"));
        vm.stopBroadcast();
    }
}
