import { DEFAULT_ROUTE_ID, type CreateRequest } from "@gateway/protocol";
import { getAddress, verifyTypedData } from "viem";

const requestTypes = {
  GatewayRequest: [
    { name: "routeId", type: "string" },
    { name: "requestId", type: "bytes32" },
    { name: "originContract", type: "address" },
    { name: "callback", type: "address" },
    { name: "nonce", type: "uint64" },
    { name: "expiry", type: "string" },
    { name: "question", type: "string" },
    { name: "policy", type: "string" },
    { name: "evidence", type: "string" },
  ],
} as const;

export async function verifyGatewayRequestSignature(request: CreateRequest) {
  return verifyTypedData({
    address: getAddress(request.requester),
    domain: {
      name: "GenLayer Gateway API",
      version: "1",
      chainId: 84532,
    },
    types: requestTypes,
    primaryType: "GatewayRequest",
    message: {
      routeId: request.routeId ?? DEFAULT_ROUTE_ID,
      requestId: request.requestId as `0x${string}`,
      originContract: getAddress(request.originContract),
      callback: getAddress(request.callback),
      nonce: BigInt(request.nonce),
      expiry: request.expiry,
      question: request.question,
      policy: request.policy,
      evidence: JSON.stringify(request.evidence),
    },
    signature: request.signature as `0x${string}`,
  });
}

export const gatewayRequestTypes = requestTypes;
