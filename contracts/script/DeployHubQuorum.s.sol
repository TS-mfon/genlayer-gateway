// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LayerZeroHubForwarderQuorum } from "../src/transport/LayerZeroHubForwarderQuorum.sol";

interface VmDeployHubQuorum {
    function envAddress(string calldata) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployHubQuorum {
    VmDeployHubQuorum private constant vm =
        VmDeployHubQuorum(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (address forwarderAddress) {
        require(block.chainid == 421_614, "Arbitrum Sepolia only");
        address[] memory signers = new address[](3);
        signers[0] = vm.envAddress("RESULT_ATTESTOR_1_ADDRESS");
        signers[1] = vm.envAddress("RESULT_ATTESTOR_2_ADDRESS");
        signers[2] = vm.envAddress("RESULT_ATTESTOR_3_ADDRESS");

        vm.startBroadcast();
        LayerZeroHubForwarderQuorum forwarder = new LayerZeroHubForwarderQuorum(
            vm.envAddress("HUB_LAYERZERO_ENDPOINT"),
            vm.envAddress("HUB_DEPLOYER_ADDRESS"),
            signers,
            2
        );
        vm.stopBroadcast();
        return address(forwarder);
    }
}
