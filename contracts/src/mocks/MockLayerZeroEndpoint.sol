// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    ILayerZeroEndpointV2,
    ILayerZeroReceiverV2,
    MessagingFee,
    MessagingParams,
    MessagingReceipt,
    Origin
} from "../transport/LayerZeroTypes.sol";

contract MockLayerZeroEndpoint is ILayerZeroEndpointV2 {
    uint32 public immutable override eid;
    uint256 public fee;
    uint64 public nonce;
    bytes32 public lastGuid;
    address public lastSender;
    MessagingParams private lastParams;

    constructor(uint32 eid_, uint256 fee_) {
        eid = eid_;
        fee = fee_;
    }

    function setFee(uint256 newFee) external {
        fee = newFee;
    }

    function quote(MessagingParams calldata, address) external view returns (MessagingFee memory) {
        return MessagingFee(fee, 0);
    }

    function send(MessagingParams calldata params, address)
        external
        payable
        returns (MessagingReceipt memory receipt)
    {
        require(msg.value == fee, "fee");
        lastSender = msg.sender;
        lastParams = params;
        lastGuid = keccak256(
            abi.encode(++nonce, msg.sender, params.dstEid, params.receiver, params.message)
        );
        receipt = MessagingReceipt(lastGuid, nonce, MessagingFee(fee, 0));
    }

    function getLastMessage() external view returns (MessagingParams memory) {
        return lastParams;
    }

    function deliver(
        address receiver,
        uint32 sourceEid,
        bytes32 sourceSender,
        bytes32 guid,
        bytes calldata message
    ) external {
        ILayerZeroReceiverV2(receiver)
            .lzReceive(Origin(sourceEid, sourceSender, nonce), guid, message, address(this), "");
    }
}
