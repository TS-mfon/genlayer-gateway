// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract GatewayRouteRegistry {
    struct Route {
        address destinationContract;
        bytes4 methodSelector;
        bytes32 argumentSchema;
        bytes32 resultSchema;
        bool active;
    }

    error Unauthorized(address caller);
    error InvalidAddress();
    error InvalidRoute(bytes32 routeId);
    error DuplicateRoute(bytes32 routeId);
    error InvalidSchema();

    event RouteRegistered(
        bytes32 indexed routeId,
        address indexed destinationContract,
        bytes4 methodSelector,
        bytes32 argumentSchema,
        bytes32 resultSchema
    );
    event RouteStatusUpdated(bytes32 indexed routeId, bool active);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    address public owner;
    mapping(bytes32 routeId => Route route) private routes;

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        owner = initialOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    function registerRoute(
        bytes32 routeId,
        address destinationContract,
        bytes4 methodSelector,
        bytes32 argumentSchema,
        bytes32 resultSchema
    ) external onlyOwner {
        if (routeId == bytes32(0) || destinationContract == address(0)) {
            revert InvalidAddress();
        }
        if (
            methodSelector == bytes4(0) || argumentSchema == bytes32(0)
                || resultSchema == bytes32(0)
        ) {
            revert InvalidSchema();
        }
        if (routes[routeId].destinationContract != address(0)) revert DuplicateRoute(routeId);
        routes[routeId] =
            Route(destinationContract, methodSelector, argumentSchema, resultSchema, true);
        emit RouteRegistered(
            routeId, destinationContract, methodSelector, argumentSchema, resultSchema
        );
    }

    function setRouteStatus(bytes32 routeId, bool active) external onlyOwner {
        if (routes[routeId].destinationContract == address(0)) revert InvalidRoute(routeId);
        routes[routeId].active = active;
        emit RouteStatusUpdated(routeId, active);
    }

    function getRoute(bytes32 routeId) external view returns (Route memory) {
        return routes[routeId];
    }

    function isActive(bytes32 routeId) external view returns (bool) {
        return routes[routeId].active;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
