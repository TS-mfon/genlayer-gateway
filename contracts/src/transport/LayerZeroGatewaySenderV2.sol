// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { GatewayRouterV2 } from "../GatewayRouterV2.sol";
import { ITransportAdapter } from "../interfaces/ITransportAdapter.sol";
import { ILayerZeroEndpointV2, MessagingFee, MessagingParams } from "./LayerZeroTypes.sol";

contract LayerZeroGatewaySenderV2 is ITransportAdapter {
    ILayerZeroEndpointV2 public immutable endpoint;
    address public owner;
    GatewayRouterV2 public router;
    uint32 public remoteEid;
    bytes32 public remoteReceiver;
    uint64 public messageNonce;
    bytes public options;

    error Unauthorized();
    error InvalidAddress();
    error InvalidFee();

    event MessageSent(bytes32 indexed messageId, bytes32 indexed endpointGuid, bytes32 indexed requestId, address destination);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    constructor(address endpoint_, address owner_, uint32 remoteEid_, bytes32 remoteReceiver_) {
        if (endpoint_ == address(0) || owner_ == address(0) || remoteReceiver_ == bytes32(0)) revert InvalidAddress();
        endpoint = ILayerZeroEndpointV2(endpoint_);
        owner = owner_;
        remoteEid = remoteEid_;
        remoteReceiver = remoteReceiver_;
    }

    modifier onlyOwner() { if (msg.sender != owner) revert Unauthorized(); _; }

    function setRouter(address router_) external onlyOwner { if (router_ == address(0)) revert InvalidAddress(); router = GatewayRouterV2(router_); }
    function setRemote(uint32 eid, bytes32 receiver) external onlyOwner { if (receiver == bytes32(0)) revert InvalidAddress(); remoteEid = eid; remoteReceiver = receiver; }
    function setOptions(bytes calldata newOptions) external onlyOwner { options = newOptions; }
    function transferOwnership(address newOwner) external onlyOwner { if (newOwner == address(0)) revert InvalidAddress(); address oldOwner = owner; owner = newOwner; emit OwnershipTransferred(oldOwner, newOwner); }

    function _decode(bytes calldata payload) private pure returns (bytes32 requestId, address destination) {
        (, requestId,,,,,,,, destination,,,,,) = abi.decode(payload, (uint8, bytes32, bytes32, uint256, address, address, address, uint64, uint64, address, bytes4, bytes32, bytes32, bytes, bytes32));
    }

    function quoteDispatch(bytes calldata payload) external view returns (uint256) {
        (, address destination) = _decode(payload);
        bytes memory message = abi.encode(uint32(block.chainid), address(router), destination, payload, bytes32(0));
        return endpoint.quote(MessagingParams(remoteEid, remoteReceiver, message, options, false), address(this)).nativeFee;
    }

    function dispatch(bytes calldata payload) external payable returns (bytes32 messageId) {
        if (msg.sender != address(router)) revert Unauthorized();
        (bytes32 requestId, address destination) = _decode(payload);
        messageId = keccak256(abi.encode(block.chainid, address(this), address(router), requestId, ++messageNonce));
        bytes memory message = abi.encode(uint32(block.chainid), address(router), destination, payload, messageId);
        MessagingParams memory params = MessagingParams(remoteEid, remoteReceiver, message, options, false);
        MessagingFee memory fee = endpoint.quote(params, address(this));
        if (msg.value != fee.nativeFee) revert InvalidFee();
        bytes32 guid = endpoint.send{ value: msg.value }(params, payable(msg.sender)).guid;
        emit MessageSent(messageId, guid, requestId, destination);
    }
}
