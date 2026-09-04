"use client";

export function ToastRegion({ message, error }: { message?: string; error?: string }) {
  const text = error || message;
  if (!text) return null;
  return <div className={`toast-region ${error ? "toast-error" : "toast-success"}`} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>{text}</div>;
}
