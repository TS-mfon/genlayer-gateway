// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AgentEscrow } from "../src/AgentEscrow.sol";
import { GatewayRouter } from "../src/GatewayRouter.sol";
import { LayerZeroGatewaySender } from "../src/transport/LayerZeroGatewaySender.sol";
import { LayerZeroResultReceiver } from "../src/transport/LayerZeroResultReceiver.sol";

interface VmDeployBase {
    function envAddress(string calldata) external returns (address);
    function envBytes(string calldata) external returns (bytes memory);
    function envUint(string calldata) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployBaseSepolia {
    VmDeployBase private constant vm =
        VmDeployBase(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run()
        external
        returns (
            address senderAddress,
            address routerAddress,
            address receiverAddress,
            address escrowAddress
        )
    {
        require(block.chainid == 84_532, "Base Sepolia only");
        address owner = vm.envAddress("BASE_DEPLOYER_ADDRESS");
        address endpoint = vm.envAddress("BASE_LAYERZERO_ENDPOINT");
        uint32 hubEid = uint32(vm.envUint("HUB_LAYERZERO_EID"));
        bytes32 hubReceiver = bytes32(uint256(uint160(vm.envAddress("HUB_RECEIVER_ADDRESS"))));
        bytes32 hubForwarder = bytes32(uint256(uint160(vm.envAddress("HUB_FORWARDER_ADDRESS"))));
        bytes memory options = vm.envBytes("LAYERZERO_OPTIONS");

        vm.startBroadcast();
        LayerZeroGatewaySender sender =
            new LayerZeroGatewaySender(endpoint, owner, hubEid, hubReceiver, owner);
        GatewayRouter router = new GatewayRouter(owner, address(sender));
        LayerZeroResultReceiver receiver = new LayerZeroResultReceiver(endpoint, owner, 4_221);
        AgentEscrow escrow = new AgentEscrow(address(router));
        sender.setRouter(address(router));
        sender.setOptions(options);
        receiver.setRouter(address(router));
        receiver.setTrustedForwarder(hubEid, hubForwarder);
        router.setResultReceiver(address(receiver));
        vm.stopBroadcast();
        return (address(sender), address(router), address(receiver), address(escrow));
    }
}
