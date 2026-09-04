// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouteRegistry } from "../src/GatewayRouteRegistry.sol";
import { GatewayRouterV2 } from "../src/GatewayRouterV2.sol";
import { IGatewayBytesCallback } from "../src/interfaces/IGatewayBytesCallback.sol";
import { MockTransportAdapter } from "../src/mocks/MockTransportAdapter.sol";

interface VmRouterV2 {
    function chainId(uint256) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function expectRevert(bytes4 selector) external;
    function expectPartialRevert(bytes4 selector) external;
}

contract BytesCallback is IGatewayBytesCallback {
    uint256 public calls;
    bytes32 public lastRequestId;
    bytes32 public lastRouteId;
    bytes32 public lastResultTxHash;
    bytes public lastResult;

    function onGatewayResult(bytes32 requestId, bytes32 routeId, bytes32 resultTxHash, bytes calldata result)
        external
    {
        calls++;
        lastRequestId = requestId;
        lastRouteId = routeId;
        lastResultTxHash = resultTxHash;
        lastResult = result;
    }
}

contract GatewayRouterV2Test {
    VmRouterV2 private constant vm =
        VmRouterV2(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant CLIENT = address(0xA11CE);
    address private constant DESTINATION = address(0xD0C);
    bytes32 private constant ROUTE_ID = keccak256("claims-adjudicator");
    bytes32 private constant ARGUMENT_SCHEMA = keccak256("ClaimArgsV1");
    bytes32 private constant RESULT_SCHEMA = keccak256("ClaimResultV1");
    bytes4 private constant METHOD = bytes4(keccak256("evaluate(bytes)"));

    MockTransportAdapter private transport;
    GatewayRouteRegistry private registry;
    GatewayRouterV2 private router;
    BytesCallback private callback;

    function setUp() public {
        vm.chainId(84_532);
        transport = new MockTransportAdapter(0.0001 ether);
        registry = new GatewayRouteRegistry(address(this));
        registry.registerRoute(ROUTE_ID, DESTINATION, METHOD, ARGUMENT_SCHEMA, RESULT_SCHEMA);
        router = new GatewayRouterV2(address(this), address(transport), address(registry));
        router.setResultReceiver(address(this));
        callback = new BytesCallback();
        vm.deal(CLIENT, 2 ether);
    }

    function testRouteRequestCommitsDestinationMethodSchemasAndArguments() public {
        bytes memory arguments_ = abi.encode("claim-1", uint256(7));
        vm.prank(CLIENT);
        (bytes32 requestId, bytes32 messageId) = router.requestRoute{ value: 0.001 ether }(
            ROUTE_ID, arguments_, address(callback), 1, uint64(block.timestamp + 1 days)
        );
        require(messageId != bytes32(0), "message");
        GatewayRouterV2.Request memory request = router.getRequest(requestId);
        require(request.routeId == ROUTE_ID, "route");
        require(request.destinationContract == DESTINATION, "destination");
        require(request.methodSelector == METHOD, "method");
        require(request.argumentSchema == ARGUMENT_SCHEMA, "argument schema");
        require(request.resultSchema == RESULT_SCHEMA, "result schema");
        require(request.argumentsHash == keccak256(arguments_), "arguments");
        require(router.accruedFees() == 0.0009 ether, "fee remainder");
    }

    function testResultIsGenericAndCallbackIsReplayProtected() public {
        bytes memory arguments_ = hex"1234";
        vm.prank(CLIENT);
        (bytes32 requestId,) = router.requestRoute{ value: 0.001 ether }(
            ROUTE_ID, arguments_, address(callback), 1, uint64(block.timestamp + 1 days)
        );
        bytes memory result = abi.encode("approved", uint256(42));
        bytes32 resultTxHash = keccak256("genlayer-result");
        router.handleResult(requestId, resultTxHash, result);
        require(callback.calls() == 1, "callback");
        require(keccak256(callback.lastResult()) == keccak256(result), "result");
        require(callback.lastRouteId() == ROUTE_ID, "callback route");
        vm.expectPartialRevert(GatewayRouterV2.InvalidRequestState.selector);
        router.handleResult(requestId, resultTxHash, result);
    }

    function testPausedRouteCannotBeUsed() public {
        registry.setRouteStatus(ROUTE_ID, false);
        vm.expectPartialRevert(GatewayRouterV2.InvalidRoute.selector);
        router.requestRoute{ value: 0.001 ether }(
            ROUTE_ID, hex"01", address(callback), 1, uint64(block.timestamp + 1 days)
        );
    }

    function testUnauthorizedResultCannotFinalize() public {
        vm.prank(CLIENT);
        (bytes32 requestId,) = router.requestRoute{ value: 0.001 ether }(
            ROUTE_ID, hex"01", address(callback), 1, uint64(block.timestamp + 1 days)
        );
        vm.expectPartialRevert(GatewayRouterV2.Unauthorized.selector);
        vm.prank(address(0xBAD));
        router.handleResult(requestId, keccak256("result"), hex"01");
    }
}
