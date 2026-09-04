"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Wallet } from "lucide-react";
import { useState } from "react";
import { createPublicClient, createWalletClient, custom, decodeEventLog, defineChain, http, keccak256, parseEther, toBytes } from "viem";
import { upsertJob } from "@/lib/jobs";
import { ToastRegion } from "./shared/toast-region";

type Config = { agentEscrow: string | null; chainName: string; requestFeeEth: string; baseRpcUrl: string };
const chain = defineChain({ id: 84532, name: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://sepolia.base.org"] } }, testnet: true });
const abi = [
  { type: "function", name: "createJob", stateMutability: "payable", inputs: [{ name: "worker", type: "address" }, { name: "deadline", type: "uint64" }, { name: "policyHash", type: "bytes32" }], outputs: [{ name: "jobId", type: "uint256" }] },
  { type: "event", name: "JobCreated", anonymous: false, inputs: [{ name: "jobId", type: "uint256", indexed: true }, { name: "client", type: "address", indexed: true }, { name: "worker", type: "address", indexed: true }, { name: "bounty", type: "uint256", indexed: false }, { name: "deadline", type: "uint64", indexed: false }, { name: "policyHash", type: "bytes32", indexed: false }] },
] as const;

export function CreateJobForm({ config }: { config: Config }) {
  const [form, setForm] = useState({ title: "Verify a completed Solidity task", description: "Build and prove a small Solidity deliverable.", policy: "Pass only when the pinned evidence proves the requirements and tests pass.", worker: "", bountyEth: "0.01" });
  const [status, setStatus] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function create() {
    const ethereum = (window as Window & { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
    if (!ethereum) return setError("Install or open an injected wallet such as MetaMask.");
    if (!config.agentEscrow) return setError("The escrow contract is not configured.");
    if (!/^0x[0-9a-fA-F]{40}$/.test(form.worker)) return setError("Enter a valid worker wallet address.");
    setLoading(true); setError(""); setStatus("Waiting for the client wallet to approve the escrow transaction…");
    try {
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] });
      const wallet = createWalletClient({ chain, transport: custom(ethereum) }); const [client] = await wallet.requestAddresses();
      if (!client) throw new Error("No wallet selected");
      const hash = await wallet.writeContract({ account: client, address: config.agentEscrow as `0x${string}`, abi, functionName: "createJob", args: [form.worker as `0x${string}`, BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60), keccak256(toBytes(form.policy))], value: parseEther(form.bountyEth) });
      setStatus("Transaction confirmed. Saving the job to this browser…");
      const publicClient = createPublicClient({ chain, transport: http(config.baseRpcUrl) }); const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const event = receipt.logs.map((log) => { try { return decodeEventLog({ abi, data: log.data, topics: log.topics }); } catch { return null; } }).find((item) => item?.eventName === "JobCreated");
      if (!event || event.eventName !== "JobCreated") throw new Error("The job was created but the event could not be read.");
      const id = event.args.jobId.toString();
      upsertJob({ id: `chain-${id}`, onChainJobId: id, title: form.title, description: form.description, policy: form.policy, worker: form.worker, client, bountyEth: form.bountyEth, evidenceUri: "", evidenceHash: "", status: "OPEN", chain: config.chainName, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      setStatus(`Job ${id} created and saved. Open your client dashboard to continue.`);
      setForm((current) => ({ ...current, title: "", description: "", worker: "" }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Job creation failed"); setStatus(""); } finally { setLoading(false); }
  }
  return <main className="app-page narrow-page"><div className="page-heading"><div><span className="eyebrow">CLIENT · BASE SEPOLIA</span><h1>Post a job</h1><p>Fund a task, name the worker, and let GenLayer review the submitted proof later.</p></div><span className="network-pill">{config.chainName}</span></div><section className="form-card"><div className="form-intro"><CheckCircle2 size={22} /><div><strong>Your bounty stays in escrow</strong><p>The contract holds the funds until the final decision returns to Base.</p></div></div><div className="form-grid"><label>Job title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What should the worker deliver?" /></label><label>Worker wallet address<input value={form.worker} onChange={(e) => setForm({ ...form, worker: e.target.value })} placeholder="0x…" /></label><label className="wide">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label className="wide">Review policy<textarea value={form.policy} onChange={(e) => setForm({ ...form, policy: e.target.value })} /><small>Write the rule GenLayer should apply to the evidence.</small></label><label>Bounty in ETH<input value={form.bountyEth} onChange={(e) => setForm({ ...form, bountyEth: e.target.value })} /></label></div><button className="button primary form-submit" onClick={() => void create()} disabled={loading}><Wallet size={17} /> {loading ? "Waiting for wallet…" : "Create funded job"}</button>{status && <p className="success-text" aria-live="polite">{status}</p>}{error && <p className="error-text" aria-live="assertive">{error}</p>}<ToastRegion message={status} error={error} /></section><div className="after-create"><span>Next step</span><strong>Ask the worker to submit evidence from the job page.</strong><Link className="text-link" href="/dashboard/client">View client dashboard <ArrowRight size={15} /> </Link></div></main>;
}
