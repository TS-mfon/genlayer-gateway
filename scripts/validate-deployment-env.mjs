const groups = {
  common: ["PROTOCOL_OWNER", "BASE_LAYERZERO_EID", "HUB_LAYERZERO_EID", "LAYERZERO_OPTIONS"],
  hubDeploy: ["HUB_RPC_URL", "HUB_CHAIN_ID", "HUB_LAYERZERO_ENDPOINT", "HUB_DEPLOYER_ADDRESS", "HUB_DEPLOYER_KEYSTORE", "HUB_RELAYER_ADDRESS"],
  hubQuorumDeploy: ["HUB_RPC_URL", "HUB_CHAIN_ID", "HUB_LAYERZERO_ENDPOINT", "HUB_DEPLOYER_ADDRESS", "HUB_DEPLOYER_KEYSTORE", "RESULT_ATTESTOR_1_ADDRESS", "RESULT_ATTESTOR_2_ADDRESS", "RESULT_ATTESTOR_3_ADDRESS"],
  hubConfigure: ["HUB_RPC_URL", "HUB_DEPLOYER_ADDRESS", "HUB_DEPLOYER_KEYSTORE", "HUB_RECEIVER_ADDRESS", "HUB_FORWARDER_ADDRESS", "RESULT_ATTESTOR_ADDRESS"],
  hubQuorumConfigure: ["HUB_RPC_URL", "HUB_DEPLOYER_ADDRESS", "HUB_DEPLOYER_KEYSTORE", "HUB_RECEIVER_ADDRESS", "HUB_QUORUM_FORWARDER_ADDRESS", "HUB_RELAYER_ADDRESS", "BASE_RESULT_RECEIVER_ADDRESS"],
  baseDeploy: ["BASE_SEPOLIA_RPC_URL", "BASE_LAYERZERO_ENDPOINT", "BASE_DEPLOYER_ADDRESS", "BASE_DEPLOYER_KEYSTORE", "HUB_RECEIVER_ADDRESS", "HUB_FORWARDER_ADDRESS"],
  baseConfigure: ["BASE_SEPOLIA_RPC_URL", "BASE_DEPLOYER_ADDRESS", "BASE_DEPLOYER_KEYSTORE", "BASE_SENDER_ADDRESS", "BASE_RESULT_RECEIVER_ADDRESS", "BASE_GATEWAY_ROUTER_ADDRESS"],
  baseOwnership: ["PROTOCOL_OWNER", "BASE_SEPOLIA_RPC_URL", "BASE_DEPLOYER_ADDRESS", "BASE_DEPLOYER_KEYSTORE", "BASE_SENDER_ADDRESS", "BASE_RESULT_RECEIVER_ADDRESS", "BASE_GATEWAY_ROUTER_ADDRESS"],
  hubOwnership: ["PROTOCOL_OWNER", "HUB_RPC_URL", "HUB_DEPLOYER_ADDRESS", "HUB_DEPLOYER_KEYSTORE", "HUB_RECEIVER_ADDRESS", "HUB_FORWARDER_ADDRESS"],
  genlayer: ["GENLAYER_SUBMITTER_ADDRESS", "GENLAYER_PROTOCOL_OWNER_ADDRESS", "BASE_GATEWAY_ROUTER_ADDRESS", "GENLAYER_GATEWAY_ADDRESS"],
  runtime: ["MONGODB_URI", "RECONCILE_SECRET", "HUB_RELAYER_PRIVATE_KEY", "RESULT_ATTESTOR_PRIVATE_KEY", "GENLAYER_GATEWAY_ADDRESS", "HUB_RECEIVER_ADDRESS", "HUB_FORWARDER_ADDRESS"],
  quorumRuntime: ["MONGODB_URI", "RECONCILE_SECRET", "HUB_RELAYER_PRIVATE_KEY", "GENLAYER_GATEWAY_ADDRESS", "HUB_RECEIVER_ADDRESS", "HUB_QUORUM_FORWARDER_ADDRESS", "RESULT_ATTESTOR_1_PRIVATE_KEY", "RESULT_ATTESTOR_2_PRIVATE_KEY", "RESULT_ATTESTOR_QUORUM"],
};
const selected = process.argv.slice(2);
const names = [...new Set((selected.length ? selected : Object.keys(groups)).flatMap((name) => {
  if (!groups[name]) throw new Error(`Unknown environment group: ${name}`);
  return groups[name];
}))];
const missing = names.filter((name) => !process.env[name]);
const invalid = names.filter((name) => {
  const value = process.env[name];
  if (!value) return false;
  if (name.endsWith("PRIVATE_KEY")) return !/^0x[0-9a-fA-F]{64}$/.test(value);
  if (name.endsWith("ADDRESS") || name.endsWith("ENDPOINT")) return !/^0x[0-9a-fA-F]{40}$/.test(value);
  if (name.endsWith("KEYSTORE")) return value.trim().length === 0;
  if (name.endsWith("EID") || name.endsWith("CHAIN_ID")) return !/^\d+$/.test(value) || Number(value) <= 0;
  if (name === "LAYERZERO_OPTIONS") return !/^0x[0-9a-fA-F]*$/.test(value);
  if (name.endsWith("RPC_URL") || name === "MONGODB_URI") {
    try { new URL(value); return false; } catch { return true; }
  }
  return false;
});
if (missing.length || invalid.length) {
  console.error(JSON.stringify({ ok: false, missing, invalid }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checked: names }, null, 2));
