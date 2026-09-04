// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LayerZeroHubForwarder } from "../src/transport/LayerZeroHubForwarder.sol";
import { LayerZeroHubReceiver } from "../src/transport/LayerZeroHubReceiver.sol";

interface VmTransferHub {
    function envAddress(string calldata) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract TransferHubOwnership {
    VmTransferHub private constant vm =
        VmTransferHub(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        address protocolOwner = vm.envAddress("PROTOCOL_OWNER");
        vm.startBroadcast();
        LayerZeroHubReceiver(vm.envAddress("HUB_RECEIVER_ADDRESS")).transferOwnership(protocolOwner);
        LayerZeroHubForwarder(vm.envAddress("HUB_FORWARDER_ADDRESS"))
            .transferOwnership(protocolOwner);
        vm.stopBroadcast();
    }
}
