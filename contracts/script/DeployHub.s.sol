// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { LayerZeroHubForwarder } from "../src/transport/LayerZeroHubForwarder.sol";
import { LayerZeroHubReceiver } from "../src/transport/LayerZeroHubReceiver.sol";

interface VmDeployHub {
    function envAddress(string calldata) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployHub {
    VmDeployHub private constant vm =
        VmDeployHub(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (address receiverAddress, address forwarderAddress) {
        address owner = vm.envAddress("HUB_DEPLOYER_ADDRESS");
        address relayer = vm.envAddress("HUB_RELAYER_ADDRESS");
        address endpoint = vm.envAddress("HUB_LAYERZERO_ENDPOINT");

        vm.startBroadcast();
        LayerZeroHubReceiver receiver = new LayerZeroHubReceiver(endpoint, owner);
        LayerZeroHubForwarder forwarder = new LayerZeroHubForwarder(endpoint, owner);
        receiver.setRelayer(relayer, true);
        forwarder.setRelayer(relayer, true);
        vm.stopBroadcast();
        return (address(receiver), address(forwarder));
    }
}
