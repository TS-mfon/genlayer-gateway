import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

const output = ".env.attestors.local";
if (existsSync(output)) throw new Error(`${output} already exists; remove it only if you intend to rotate testnet keys`);

const keys = Array.from({ length: 3 }, () => `0x${randomBytes(32).toString("hex")}`);
const addresses = keys.map((key) => privateKeyToAccount(key).address);
if (new Set(addresses.map((address) => address.toLowerCase())).size !== addresses.length) throw new Error("Generated duplicate attestor address");

const lines = [
  "# TESTNET ONLY. Keep this file local and never commit or upload it.",
  "RESULT_ATTESTOR_QUORUM=2",
  ...keys.flatMap((key, index) => [`RESULT_ATTESTOR_${index + 1}_PRIVATE_KEY=${key}`, `RESULT_ATTESTOR_${index + 1}_ADDRESS=${addresses[index]}`]),
  "",
];
writeFileSync(output, lines.join("\n"), { mode: 0o600, flag: "wx" });
chmodSync(output, 0o600);
console.log("Generated three testnet attestor accounts. Fund these public addresses:");
addresses.forEach((address, index) => console.log(`RESULT_ATTESTOR_${index + 1}_ADDRESS=${address}`));
