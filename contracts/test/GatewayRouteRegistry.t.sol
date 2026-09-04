// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouteRegistry } from "../src/GatewayRouteRegistry.sol";

interface VmRouteRegistry {
    function expectRevert(bytes4 selector) external;
    function expectPartialRevert(bytes4 selector) external;
    function prank(address sender) external;
}

contract GatewayRouteRegistryTest {
    VmRouteRegistry private constant vm =
        VmRouteRegistry(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant OWNER = address(0xA11CE);
    address private constant ATTACKER = address(0xBAD);
    bytes32 private constant ROUTE = keccak256("claims-adjudicator");
    bytes32 private constant ARGUMENT_SCHEMA = keccak256("ClaimArgsV1");
    bytes32 private constant RESULT_SCHEMA = keccak256("ClaimResultV1");

    GatewayRouteRegistry private registry;

    function setUp() public {
        registry = new GatewayRouteRegistry(OWNER);
    }

    function testOwnerCanRegisterAndPauseRoute() public {
        vm.prank(OWNER);
        registry.registerRoute(
            ROUTE,
            address(0x1234),
            bytes4(keccak256("evaluate(bytes)")),
            ARGUMENT_SCHEMA,
            RESULT_SCHEMA
        );
        require(registry.isActive(ROUTE), "active");
        vm.prank(OWNER);
        registry.setRouteStatus(ROUTE, false);
        require(!registry.isActive(ROUTE), "paused");
    }

    function testUnauthorizedCannotRegister() public {
        vm.expectPartialRevert(GatewayRouteRegistry.Unauthorized.selector);
        vm.prank(ATTACKER);
        registry.registerRoute(
            ROUTE,
            address(0x1234),
            bytes4(keccak256("evaluate(bytes)")),
            ARGUMENT_SCHEMA,
            RESULT_SCHEMA
        );
    }

    function testInvalidRouteAndDuplicateRevert() public {
        vm.expectRevert(GatewayRouteRegistry.InvalidAddress.selector);
        vm.prank(OWNER);
        registry.registerRoute(
            bytes32(0), address(0x1234), bytes4(uint32(1)), ARGUMENT_SCHEMA, RESULT_SCHEMA
        );

        vm.prank(OWNER);
        registry.registerRoute(
            ROUTE, address(0x1234), bytes4(uint32(1)), ARGUMENT_SCHEMA, RESULT_SCHEMA
        );
        vm.expectPartialRevert(GatewayRouteRegistry.DuplicateRoute.selector);
        vm.prank(OWNER);
        registry.registerRoute(
            ROUTE, address(0x5678), bytes4(uint32(2)), ARGUMENT_SCHEMA, RESULT_SCHEMA
        );
    }

    function testSchemaAndUnknownStatusRevert() public {
        vm.expectRevert(GatewayRouteRegistry.InvalidSchema.selector);
        vm.prank(OWNER);
        registry.registerRoute(ROUTE, address(0x1234), bytes4(0), ARGUMENT_SCHEMA, RESULT_SCHEMA);

        vm.expectPartialRevert(GatewayRouteRegistry.InvalidRoute.selector);
        vm.prank(OWNER);
        registry.setRouteStatus(ROUTE, false);
    }
}
