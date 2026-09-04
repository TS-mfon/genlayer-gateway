// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ITransportAdapter {
    function quoteDispatch(bytes calldata payload) external view returns (uint256);

    function dispatch(bytes calldata payload) external payable returns (bytes32 messageId);
}
