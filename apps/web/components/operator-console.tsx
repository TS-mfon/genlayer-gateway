"use client";

import { useState } from "react";
import { CheckCircle2, LockKeyhole, RefreshCw, ShieldAlert, Wallet } from "lucide-react";
import { createPublicClient, createWalletClient, custom, defineChain, http } from "viem";

type OperatorConfig = {
  gatewayRouter: string | null;
  protocolOwner: string | null;
  baseSender: string | null;
  baseResultReceiver: string | null;
  hubReceiver: string | null;
  hubForwarder: string | null;
  quorumForwarder: string | null;
  baseEid: number;
  hubEid: number;
  hubChainId: number;
};

const baseChain = defineChain({ id: 84532, name: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://sepolia.base.org"] } }, testnet: true });
const hubChain = defineChain({ id: 421614, name: "Arbitrum Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://sepolia-rollup.arbitrum.io/rpc"] } }, testnet: true });
const REQUIRED_RECEIVE_OPTIONS = "0x000301001101000000000000000000000000000f4240";

const ownerAbi = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
const baseSenderAbi = [
  ...ownerAbi,
  { type: "function", name: "options", stateMutability: "view", inputs: [], outputs: [{ type: "bytes" }] },
  { type: "function", name: "setOptions", stateMutability: "nonpayable", inputs: [{ name: "newOptions", type: "bytes" }], outputs: [] },
] as const;
const routerAbi = [
  ...ownerAbi,
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "setPaused", stateMutability: "nonpayable", inputs: [{ name: "newPaused", type: "bool" }], outputs: [] },
] as const;
const receiverAbi = [
  ...ownerAbi,
  { type: "function", name: "trustedForwarders", stateMutability: "view", inputs: [{ name: "eid", type: "uint32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "setTrustedForwarder", stateMutability: "nonpayable", inputs: [{ name: "eid", type: "uint32" }, { name: "sender", type: "bytes32" }], outputs: [] },
] as const;
const quorumAbi = [
  ...ownerAbi,
  { type: "function", name: "quorum", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "signerEpoch", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "setQuorum", stateMutability: "nonpayable", inputs: [{ name: "newQuorum", type: "uint8" }], outputs: [] },
] as const;

function asBytes32(address: string) {
  return `0x${address.replace(/^0x/i, "").padStart(64, "0")}` as `0x${string}`;
}

export function OperatorConsole({ config }: { config: OperatorConfig }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [options, setOptions] = useState("0x000301001101000000000000000000000000000f4240");
  const [quorum, setQuorum] = useState("2");
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const provider = () => {
    const injected = (window as Window & { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
    if (!injected) throw new Error("No injected EVM wallet found");
    return injected;
  };

  async function connect() {
    setError("");
    const injected = provider();
    await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] });
    const wallet = createWalletClient({ chain: baseChain, transport: custom(injected) });
    const [selected] = await wallet.requestAddresses();
    if (!selected) throw new Error("No wallet selected");
    setAccount(selected);
    await refresh(selected);
  }

  async function refresh(selected = account) {
    setError("");
    const base = createPublicClient({ chain: baseChain, transport: http() });
    const hub = createPublicClient({ chain: hubChain, transport: http() });
    const entries: Array<[string, `0x${string}` | null, unknown, readonly unknown[]]> = [
      ["Base sender", config.baseSender as `0x${string}` | null, base, baseSenderAbi],
      ["Base receiver", config.baseResultReceiver as `0x${string}` | null, base, receiverAbi],
      ["Base router", config.gatewayRouter as `0x${string}` | null, base, routerAbi],
      ["Hub receiver", config.hubReceiver as `0x${string}` | null, hub, ownerAbi],
      ["Hub quorum forwarder", config.quorumForwarder as `0x${string}` | null, hub, quorumAbi],
    ];
    const next: Record<string, string> = {};
    for (const [label, address, client, abi] of entries) {
      if (!address) continue;
      next[label] = await (client as any).readContract({ address, abi, functionName: "owner" });
    }
    setOwners(next);
    if (config.gatewayRouter) setPaused(await (base as any).readContract({ address: config.gatewayRouter as `0x${string}`, abi: routerAbi, functionName: "paused" }));
    if (config.baseSender) {
      const onChainOptions = await (base as any).readContract({ address: config.baseSender as `0x${string}`, abi: baseSenderAbi, functionName: "options" });
      setOptions(typeof onChainOptions === "string" && onChainOptions.length > 2 ? onChainOptions : REQUIRED_RECEIVE_OPTIONS);
    }
    if (config.quorumForwarder) setQuorum(String(await (hub as any).readContract({ address: config.quorumForwarder as `0x${string}`, abi: quorumAbi, functionName: "quorum" })));
    if (selected && config.protocolOwner && selected.toLowerCase() !== config.protocolOwner.toLowerCase()) setError("Connected wallet is not the configured protocol owner");
  }

  function canAdmin(label: string) {
    return Boolean(account && owners[label] && account.toLowerCase() === owners[label]!.toLowerCase());
  }

  async function baseWrite(address: `0x${string}`, abi: readonly unknown[], functionName: string, args: readonly unknown[]) {
    const injected = provider();
    await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] });
    const wallet = createWalletClient({ chain: baseChain, transport: custom(injected), account: account! });
    const hash = await (wallet as any).writeContract({ address, abi, functionName, args });
    await createPublicClient({ chain: baseChain, transport: http() }).waitForTransactionReceipt({ hash });
    return hash;
  }

  async function hubWrite(address: `0x${string}`, abi: readonly unknown[], functionName: string, args: readonly unknown[]) {
    const injected = provider();
    await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x66eee" }] });
    const wallet = createWalletClient({ chain: hubChain, transport: custom(injected), account: account! });
    const hash = await (wallet as any).writeContract({ address, abi, functionName, args });
    await createPublicClient({ chain: hubChain, transport: http() }).waitForTransactionReceipt({ hash });
    return hash;
  }

  async function updateOptions() {
    if (!config.baseSender || !canAdmin("Base sender")) return setError("Connect the Base sender owner wallet");
    if (options.toLowerCase() !== REQUIRED_RECEIVE_OPTIONS) return setError("Only the tested 1,000,000 receive-gas option is allowed");
    setLoading(true); setError("");
    try { const hash = await baseWrite(config.baseSender as `0x${string}`, baseSenderAbi, "setOptions", [options as `0x${string}`]); setMessage(`LayerZero options updated: ${hash}`); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Update failed"); } finally { setLoading(false); }
  }

  async function updatePause() {
    if (!config.gatewayRouter || !canAdmin("Base router")) return setError("Connect the router owner wallet");
    setLoading(true); setError("");
    try { const hash = await baseWrite(config.gatewayRouter as `0x${string}`, routerAbi, "setPaused", [!paused]); setMessage(`Router pause state updated: ${hash}`); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Pause update failed"); } finally { setLoading(false); }
  }

  async function updateForwarder() {
    if (!config.baseResultReceiver || !config.quorumForwarder || !canAdmin("Base receiver")) return setError("Connect the Base receiver owner wallet");
    setLoading(true); setError("");
    try { const hash = await baseWrite(config.baseResultReceiver as `0x${string}`, receiverAbi, "setTrustedForwarder", [config.hubEid, asBytes32(config.quorumForwarder)]); setMessage(`Base receiver now trusts quorum forwarder: ${hash}`); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Forwarder update failed"); } finally { setLoading(false); }
  }

  async function updateQuorum() {
    const value = Number(quorum);
    if (!config.quorumForwarder || !canAdmin("Hub quorum forwarder")) return setError("Connect the quorum forwarder owner wallet");
    if (!Number.isInteger(value) || value < 2 || value > 3) return setError("Quorum must be 2 or 3");
    setLoading(true); setError("");
    try { const hash = await hubWrite(config.quorumForwarder as `0x${string}`, quorumAbi, "setQuorum", [value]); setMessage(`Quorum updated: ${hash}`); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Quorum update failed"); } finally { setLoading(false); }
  }

  return <section className="operator-section" id="operator">
    <div className="section-heading"><div><span className="eyebrow">OWNER WALLET OPERATIONS</span><h2>Operate the protocol without sharing keys.</h2></div><button className="wallet-button" onClick={() => void connect()}><Wallet size={15} /> {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Connect owner wallet"}</button></div>
    <div className="operator-warning"><LockKeyhole size={17} /><span>Every mutation is signed by your connected wallet. Vercel never receives the owner private key.</span></div>
    <div className="operator-grid">
      <div className="operator-card"><h3>Ownership and configuration</h3>{Object.entries(owners).map(([label, owner]) => <div className="operator-row" key={label}><span>{label}</span><code>{owner.slice(0, 8)}…{owner.slice(-6)}</code><span className={canAdmin(label) ? "owner-ok" : "owner-no"}>{canAdmin(label) ? "authorized" : "owner required"}</span></div>)}<button className="button secondary" onClick={() => void refresh()} disabled={!account}><RefreshCw size={15} /> Refresh on-chain state</button></div>
      <div className="operator-card"><h3>Safety controls</h3><label>Base sender receive options<input value={options} readOnly /></label><button className="button primary" onClick={() => void updateOptions()} disabled={loading || !account}><CheckCircle2 size={15} /> Set 1,000,000 receive gas</button><button className="button secondary" onClick={() => void updateForwarder()} disabled={loading || !account || !config.quorumForwarder}><ShieldAlert size={15} /> Trust v0.2 quorum forwarder</button><button className="button secondary" onClick={() => void updatePause()} disabled={loading || !account || !config.gatewayRouter}>{paused ? "Unpause router" : "Pause router"}</button><label>Quorum threshold<input inputMode="numeric" value={quorum} onChange={(event) => setQuorum(event.target.value)} /></label><button className="button secondary" onClick={() => void updateQuorum()} disabled={loading || !account || !config.quorumForwarder}><ShieldAlert size={15} /> Update quorum on Arbitrum</button></div>
    </div>
    {message && <p className="operator-success">{message}</p>}{error && <p className="operator-error">{error}</p>}
  </section>;
}
