import dns from "node:dns/promises";
import net from "node:net";

const blockedRanges = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
];

export async function assertSafeEvidenceUrl(rawUrl: string, allowedDomains: string[] = []) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("HTTPS is required");
  if (url.username || url.password) throw new Error("Credentials are not allowed in evidence URLs");
  if (allowedDomains.length > 0 && !allowedDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    throw new Error("Evidence host is not allowlisted");
  }
  if (net.isIP(url.hostname) && blockedRanges.some((pattern) => pattern.test(url.hostname))) {
    throw new Error("Private evidence address is blocked");
  }
  const addresses = net.isIP(url.hostname) ? [url.hostname] : [
    ...(await dns.resolve4(url.hostname)),
    ...(await dns.resolve6(url.hostname).catch(() => [])),
  ];
  if (addresses.some((address) => blockedRanges.some((pattern) => pattern.test(address)))) {
    throw new Error("Evidence host resolves to a private address");
  }
  return url;
}
