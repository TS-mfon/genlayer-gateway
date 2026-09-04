// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LayerZeroHubForwarderQuorum } from "../src/transport/LayerZeroHubForwarderQuorum.sol";

interface VmTransferQuorum {
    function envAddress(string calldata) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract TransferQuorumOwnership {
    VmTransferQuorum private constant vm =
        VmTransferQuorum(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        vm.startBroadcast();
        LayerZeroHubForwarderQuorum(vm.envAddress("HUB_QUORUM_FORWARDER_ADDRESS"))
            .transferOwnership(vm.envAddress("PROTOCOL_OWNER"));
        vm.stopBroadcast();
    }
}
