// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LayerZeroHubForwarderQuorum } from "../src/transport/LayerZeroHubForwarderQuorum.sol";

interface VmConfigureHubQuorum {
    function envAddress(string calldata) external returns (address);
    function envUint(string calldata) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract ConfigureHubQuorum {
    VmConfigureHubQuorum private constant vm =
        VmConfigureHubQuorum(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        LayerZeroHubForwarderQuorum forwarder =
            LayerZeroHubForwarderQuorum(vm.envAddress("HUB_QUORUM_FORWARDER_ADDRESS"));
        uint32 baseEid = uint32(vm.envUint("BASE_LAYERZERO_EID"));
        bytes32 baseReceiver =
            bytes32(uint256(uint160(vm.envAddress("BASE_RESULT_RECEIVER_ADDRESS"))));

        vm.startBroadcast();
        forwarder.setRelayer(vm.envAddress("HUB_RELAYER_ADDRESS"), true);
        forwarder.setDestination(baseEid, baseReceiver);
        forwarder.setTrustedGenLayerSender(vm.envAddress("GENLAYER_GATEWAY_ADDRESS"));
        forwarder.setTrustedOriginRouter(vm.envAddress("BASE_GATEWAY_ROUTER_ADDRESS"));
        forwarder.setHubReceiver(vm.envAddress("HUB_RECEIVER_ADDRESS"));
        vm.stopBroadcast();
    }
}
