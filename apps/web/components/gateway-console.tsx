"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Copy, ExternalLink, RefreshCw, Search, Send, Wallet } from "lucide-react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  http,
  keccak256,
  parseEther,
  toBytes,
} from "viem";
import { upsertJob, updateJob } from "@/lib/jobs";

type ReviewedRoute = {
  id: string;
  label: string;
  destinationChainId: number;
  destinationContract: string;
  method: string;
  argumentSchema: string;
  resultSchema: string;
  status: "ACTIVE" | "PAUSED";
  trustModel: string;
  executorReady?: boolean;
};

type PublicConfig = {
  chainId: number;
  chainName: string;
  gatewayRouter: string | null;
  agentEscrow: string | null;
  transport: string;
  requestFeeEth: string;
  testnetOnly: boolean;
  quorumForwarder: string | null;
  protocolOwner: string | null;
};

type RequestView = {
  requestId: string;
  status: string;
  attempts: number;
  updatedAt: string;
  lifecycle: Array<{ status: string; at: string; detail?: string; messageId?: string }>;
  result?: { decision: string; reason: string };
};

const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  testnet: true,
});

export function GatewayConsole({ config }: { config: PublicConfig }) {
  const [requestId, setRequestId] = useState("");
  const [jobId, setJobId] = useState("");
  const [record, setRecord] = useState<RequestView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [clientAccount, setClientAccount] = useState<`0x${string}` | null>(null);
  const [workerAccount, setWorkerAccount] = useState<`0x${string}` | null>(null);
  const [routes, setRoutes] = useState<ReviewedRoute[]>([]);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    worker: "",
    bountyEth: "0.01",
    question: "Did the worker satisfy every mandatory requirement?",
    policy: "The evidence must prove passing tests and a verified deployment.",
    evidenceUri: "https://",
    evidenceHash: "",
  });

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/routes", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { routes?: ReviewedRoute[] } | null) => {
        if (active && payload?.routes) setRoutes(payload.routes);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function getWallet(role: "client" | "worker" = "client") {
    const provider = (window as Window & { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum;
    if (!provider) throw new Error("No injected EVM wallet found");
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] });
    const wallet = createWalletClient({ chain: baseSepolia, transport: custom(provider) });
    const [selected] = await wallet.requestAddresses();
    if (!selected) throw new Error("No wallet account selected");
    setAccount(selected);
    if (role === "client") setClientAccount(selected);
    else setWorkerAccount(selected);
    return { wallet, account: selected };
  }

  async function connectWallet() {
    setError("");
    try {
      await getWallet("client");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet connection failed");
    }
  }

  async function loadSampleEvidence() {
    setLoading(true);
    setError("");
    try {
      const sampleId = "job-01";
      const evidenceUri = `${window.location.origin}/api/v1/evidence/${sampleId}`;
      const response = await fetch(evidenceUri);
      const body = await response.text();
      if (!response.ok) throw new Error("Sample evidence could not be loaded");
      setForm((current) => ({ ...current, evidenceUri, evidenceHash: keccak256(toBytes(body)) }));
      setStatus("Sample evidence loaded and its commitment hash calculated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sample evidence loading failed");
    } finally {
      setLoading(false);
    }
  }

  async function createJob() {
    if (!config.agentEscrow) return;
    setLoading(true);
    setError("");
    try {
      const connected = await getWallet("client");
      setStatus("Creating funded escrow job…");
      const deadline = BigInt(Math.floor(Date.now() / 1_000) + 24 * 60 * 60);
      const transactionHash = await connected.wallet.writeContract({
        account: connected.account,
        address: config.agentEscrow as `0x${string}`,
        abi: agentEscrowAbi,
        functionName: "createJob",
        args: [form.worker as `0x${string}`, deadline, keccak256(toBytes(form.policy))],
        value: parseEther(form.bountyEth),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      const decoded = findEvent(receipt.logs, agentEscrowAbi, "JobCreated");
      if (!decoded || decoded.eventName !== "JobCreated") throw new Error("JobCreated event was not found");
      const createdJobId = decoded.args.jobId.toString();
      setJobId(createdJobId);
      upsertJob({
        id: `chain-${createdJobId}`,
        onChainJobId: createdJobId,
        title: "Gateway verification test job",
        description: "A funded test job created from the Gateway workbench.",
        policy: form.policy,
        worker: form.worker,
        client: connected.account,
        bountyEth: form.bountyEth,
        evidenceUri: "",
        evidenceHash: "",
        status: "OPEN",
        chain: "Base Sepolia",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setStatus(`Job ${decoded.args.jobId} created. Switch to the worker wallet to submit evidence.`);
    } catch (caught) {
      setStatus("");
      setError(caught instanceof Error ? caught.message : "Job creation failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitEvidence() {
    if (!config.agentEscrow || !jobId) return;
    setLoading(true);
    setError("");
    try {
      const connected = await getWallet("worker");
      if (!clientAccount || connected.account.toLowerCase() === clientAccount.toLowerCase()) {
        throw new Error("Connect a different worker wallet before submitting evidence");
      }
      setStatus("Submitting the worker evidence commitment…");
      const transactionHash = await connected.wallet.writeContract({
        account: connected.account,
        address: config.agentEscrow as `0x${string}`,
        abi: agentEscrowAbi,
        functionName: "submitEvidence",
        args: [BigInt(jobId), form.evidenceUri, form.evidenceHash as `0x${string}`],
      });
      await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      updateJob(`chain-${jobId}`, {
        evidenceUri: form.evidenceUri,
        evidenceHash: form.evidenceHash,
        status: "CLAIMED",
      });
      setStatus("Evidence committed. Switch back to the client wallet to request verification.");
    } catch (caught) {
      setStatus("");
      setError(caught instanceof Error ? caught.message : "Evidence submission failed");
    } finally {
      setLoading(false);
    }
  }

  async function requestVerification() {
    if (!config.agentEscrow || !config.gatewayRouter || !jobId) return;
    setLoading(true);
    setError("");
    try {
      const connected = await getWallet("client");
      if (clientAccount && connected.account.toLowerCase() !== clientAccount.toLowerCase()) {
        throw new Error("Reconnect the original client wallet before requesting verification");
      }
      setStatus("Dispatching the escrow verification request…");
      const expirySeconds = BigInt(Math.floor(Date.now() / 1_000) + 60 * 60);
      const transactionHash = await connected.wallet.writeContract({
        account: connected.account,
        address: config.agentEscrow as `0x${string}`,
        abi: agentEscrowAbi,
        functionName: "requestVerification",
        args: [BigInt(jobId), form.question, form.policy, expirySeconds],
        value: parseEther(config.requestFeeEth),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      const decoded = findEvent(receipt.logs, gatewayRouterAbi, "RequestDispatched");
      if (!decoded || decoded.eventName !== "RequestDispatched") {
        throw new Error("RequestDispatched event was not found");
      }
      const newRequestId = decoded.args.requestId;
      const requestState = await publicClient.readContract({
        address: config.gatewayRouter as `0x${string}`,
        abi: gatewayRouterAbi,
        functionName: "requests",
        args: [newRequestId],
      });
      const evidence = {
        version: "1" as const,
        items: [{
          kind: "CONTENT_HASH" as const,
          uri: form.evidenceUri,
          digest: form.evidenceHash,
          metadata: { jobId },
        }],
      };
      setStatus("Registering the prepaid on-chain request with the API…");
      const response = await fetch("/api/v1/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: newRequestId,
          requester: config.agentEscrow,
          originChainId: 84532,
          originContract: config.agentEscrow,
          callback: config.agentEscrow,
          question: form.question,
          policy: form.policy,
          evidence,
          nonce: requestState[3].toString(),
          expiry: new Date(Number(requestState[4]) * 1_000).toISOString(),
          transactionHash,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "API registration failed");
      setRequestId(newRequestId);
      setRecord(payload);
      updateJob(`chain-${jobId}`, { requestId: newRequestId, status: "IN_REVIEW" });
      setStatus("Verification dispatched and indexed.");
    } catch (caught) {
      setStatus("");
      setError(caught instanceof Error ? caught.message : "Verification request failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadRequest() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/requests/${encodeURIComponent(requestId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Request lookup failed");
      setRecord(payload);
    } catch (caught) {
      setRecord(null);
      setError(caught instanceof Error ? caught.message : "Request lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    if (!record) return;
    setLoading(true);
    const response = await fetch(`/api/v1/requests/${record.requestId}/retry`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "Retry failed");
    } else {
      await loadRequest();
    }
    setLoading(false);
  }

  const contractsReady = Boolean(config.gatewayRouter && config.agentEscrow);
  const evidenceReady = /^0x[0-9a-fA-F]{64}$/.test(form.evidenceHash) && form.evidenceUri.startsWith("https://");
  const selectedRoute = routes.find((route) => route.id === "gateway-adjudicator");

  return (
    <section className="console-section" id="console">
      <div className="section-heading">
        <div><span className="eyebrow">AGENT ESCROW MVP</span><h2>Run the real funded workflow.</h2></div>
        <div className={`status-banner ${contractsReady ? "ready" : "warning"}`}>
          {contractsReady ? <><span /> Contracts configured</> : <><AlertTriangle size={16} /> Awaiting testnet deployment</>}
        </div>
      </div>
      <div className="workflow-guide">
        <div className="workflow-guide-heading"><span className="eyebrow">HOW TO TEST</span><p>Use two wallets on Base Sepolia. The client creates and settles the job; the worker only submits evidence.</p></div>
        <div className="workflow-steps">
          <article><span>01 · CLIENT WALLET</span><strong>Create escrow</strong><p>Locks the bounty in AgentEscrow. The worker address must be different from the client.</p></article>
          <article><span>02 · WORKER WALLET</span><strong>Submit evidence</strong><p>Commits a versioned HTTPS evidence URL and its keccak256 hash.</p></article>
          <article><span>03 · CLIENT WALLET</span><strong>Ask GenLayer</strong><p>Dispatches the request. The relay transports it; GenLayer adjudicates asynchronously.</p></article>
          <article><span>04 · AUTOMATIC</span><strong>Settle escrow</strong><p>The finalized callback releases, refunds, or holds funds according to the verdict.</p></article>
        </div>
      </div>
      <section className="route-selection" aria-label="Selected reviewed GenLayer route">
        <div>
          <span className="eyebrow">SELECTED REVIEWED ROUTE</span>
          <strong>{selectedRoute?.label ?? "Gateway work adjudicator"}</strong>
          <p>{selectedRoute ? `GenLayer contract ${selectedRoute.destinationContract}` : "Loading the server route catalogue…"}</p>
        </div>
        <dl>
          <div><dt>Method</dt><dd><code>{selectedRoute?.method ?? "adjudicate"}</code></dd></div>
          <div><dt>Arguments</dt><dd><code>{selectedRoute?.argumentSchema ?? "GatewayAdjudicateArgsV1"}</code></dd></div>
          <div><dt>Result</dt><dd><code>{selectedRoute?.resultSchema ?? "GatewayStoredResultV1"}</code></dd></div>
          <div><dt>Trust</dt><dd>{selectedRoute?.trustModel === "THRESHOLD_ATTESTORS" ? "Threshold-attested testnet" : "Reviewed route"}</dd></div>
        </dl>
      </section>
      <div className="console-grid">
        <div className="lookup-panel">
          <div className="composer-heading">
            <div><span>Client wallet</span><strong>{clientAccount ? `${clientAccount.slice(0, 6)}…${clientAccount.slice(-4)}` : "Disconnected"}</strong><small>{workerAccount ? `Worker: ${workerAccount.slice(0, 6)}…${workerAccount.slice(-4)}` : "Worker wallet connects at step 2"}</small></div>
            <button className="wallet-button" onClick={connectWallet}><Wallet size={15} /> Connect / refresh</button>
          </div>
          <div className="composer-form">
            <label>Worker address<input value={form.worker} onChange={(event) => setForm({ ...form, worker: event.target.value })} placeholder="0x…" /></label>
            <label>Bounty (ETH)<input value={form.bountyEth} onChange={(event) => setForm({ ...form, bountyEth: event.target.value })} /></label>
            <label>Question<textarea value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} /></label>
            <label>Policy<textarea value={form.policy} onChange={(event) => setForm({ ...form, policy: event.target.value })} /></label>
            <label>Evidence URL<input value={form.evidenceUri} onChange={(event) => setForm({ ...form, evidenceUri: event.target.value })} /><small>Use an immutable HTTPS URL, such as a pinned commit or the sample evidence endpoint.</small></label>
            <label>Evidence body keccak256<input value={form.evidenceHash} onChange={(event) => setForm({ ...form, evidenceHash: event.target.value })} placeholder="0x + 64 hex" /><small>The hash must match the exact response body at the evidence URL.</small></label>
            <button className="button ghost submit-request" onClick={loadSampleEvidence} disabled={loading}>Load sample evidence and calculate hash</button>
            <label>Job ID<input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="Created automatically in step 1" /></label>
            <button className="button primary submit-request" onClick={createJob} disabled={loading || !contractsReady || !/^0x[0-9a-fA-F]{40}$/.test(form.worker)}><Send size={16} /> 1. Client creates escrow</button>
            <button className="button secondary submit-request" onClick={submitEvidence} disabled={loading || !contractsReady || !jobId || !evidenceReady}>2. Worker submits evidence</button>
            <button className="button primary submit-request" onClick={requestVerification} disabled={loading || !contractsReady || !jobId || !evidenceReady}>3. Client asks GenLayer</button>
          </div>
          {status && <p className="success-text">{status}</p>}
          {error && <p className="error-text">{error}</p>}
          <div className="lookup-row">
            <input value={requestId} onChange={(event) => setRequestId(event.target.value)} placeholder="Request ID 0x…" />
            <button onClick={loadRequest} disabled={loading || !/^0x[0-9a-fA-F]{64}$/.test(requestId)}><Search size={16} /> Inspect</button>
          </div>
          <div className="config-table">
            <div><span>Origin</span><strong>{config.chainName}</strong></div>
            <div><span>Verification fee</span><strong>{config.requestFeeEth} ETH</strong></div>
            <div><span>Transport</span><strong>{config.transport}</strong></div>
            <div><span>Escrow</span><code>{config.agentEscrow ?? "Not deployed"}</code></div>
          </div>
        </div>
        <div className="trace-panel">
          {!record ? (
            <div className="empty-trace"><ActivityGlyph /><h3>No request selected</h3><p>Start with the client wallet, create a job, switch to the worker wallet, submit evidence, then switch back to the client wallet.</p><p className="console-note">GenLayer decisions are asynchronous. Keep this page open or paste the request ID later to inspect progress.</p></div>
          ) : (
            <>
              <div className="trace-header">
                <div><span>Current state</span><strong>{record.status}</strong></div>
                <button className="icon-button" onClick={() => navigator.clipboard.writeText(record.requestId)} title="Copy request ID"><Copy size={17} /></button>
              </div>
              <ol className="timeline">
                {record.lifecycle.map((event, index) => (
                  <li key={`${event.at}-${index}`}><span className="timeline-dot" /><div><strong>{event.status}</strong><p>{event.detail ?? "Protocol state updated"}</p><time>{new Date(event.at).toLocaleString()}</time></div></li>
                ))}
              </ol>
              {record.result && <div className={`verdict ${record.result.decision.toLowerCase()}`}><span>Final verdict</span><strong>{record.result.decision}</strong><p>{record.result.reason}</p></div>}
              {record.status !== "CALLBACK_EXECUTED" && <button className="button secondary retry" onClick={retry}><RefreshCw size={16} /> Queue permissionless retry</button>}
            </>
          )}
        </div>
      </div>
      <p className="console-note"><ExternalLink size={14} /> The API accepts only requests proven by a successful router event; MongoDB cannot create a verdict.</p>
    </section>
  );
}

const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

function findEvent(logs: readonly { address: `0x${string}`; data: `0x${string}`; topics: readonly `0x${string}`[] }[], abi: typeof agentEscrowAbi | typeof gatewayRouterAbi, eventName: string) {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === eventName) return decoded;
    } catch {
      continue;
    }
  }
  return null;
}

const agentEscrowAbi = [
  { type: "function", name: "createJob", stateMutability: "payable", inputs: [{ name: "worker", type: "address" }, { name: "deadline", type: "uint64" }, { name: "policyHash", type: "bytes32" }], outputs: [{ name: "jobId", type: "uint256" }] },
  { type: "function", name: "submitEvidence", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "evidenceUri", type: "string" }, { name: "evidenceHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "requestVerification", stateMutability: "payable", inputs: [{ name: "jobId", type: "uint256" }, { name: "question", type: "string" }, { name: "policy", type: "string" }, { name: "expiry", type: "uint64" }], outputs: [{ name: "requestId", type: "bytes32" }] },
  { type: "event", name: "JobCreated", anonymous: false, inputs: [{ name: "jobId", type: "uint256", indexed: true }, { name: "client", type: "address", indexed: true }, { name: "worker", type: "address", indexed: true }, { name: "bounty", type: "uint256", indexed: false }, { name: "deadline", type: "uint64", indexed: false }, { name: "policyHash", type: "bytes32", indexed: false }] },
] as const;

const gatewayRouterAbi = [
  { type: "function", name: "requests", stateMutability: "view", inputs: [{ name: "requestId", type: "bytes32" }], outputs: [{ name: "requester", type: "address" }, { name: "originContract", type: "address" }, { name: "callback", type: "address" }, { name: "nonce", type: "uint64" }, { name: "expiry", type: "uint64" }, { name: "questionHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }, { name: "outboundMessageId", type: "bytes32" }, { name: "decision", type: "uint8" }, { name: "status", type: "uint8" }, { name: "callbackLocked", type: "bool" }, { name: "resultTxHash", type: "bytes32" }] },
  { type: "event", name: "RequestDispatched", anonymous: false, inputs: [{ name: "requestId", type: "bytes32", indexed: true }, { name: "messageId", type: "bytes32", indexed: true }, { name: "requester", type: "address", indexed: true }, { name: "originContract", type: "address", indexed: false }, { name: "callback", type: "address", indexed: false }, { name: "questionHash", type: "bytes32", indexed: false }, { name: "policyHash", type: "bytes32", indexed: false }, { name: "evidenceHash", type: "bytes32", indexed: false }] },
] as const;

function ActivityGlyph() {
  return <div className="activity-glyph"><span /><span /><span /><span /></div>;
}
