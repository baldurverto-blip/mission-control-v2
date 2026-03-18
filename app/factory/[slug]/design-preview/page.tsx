"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export default function DesignPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? params.slug : Array.isArray(params.slug) ? params.slug[0] : "";

  const [approving, setApproving] = useState(false);
  const [revisioning, setRevisioning] = useState(false);
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/factory/${slug}/design-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed");
      showToast("Build phase starting...");
      setTimeout(() => router.push("/factory"), 2000);
    } catch (err) {
      showToast(String(err));
      setApproving(false);
    }
  }

  async function handleRevisionSubmit() {
    setRevisioning(true);
    try {
      const res = await fetch(`/api/factory/${slug}/design-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revise", feedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      showToast("Revision requested. Design will regenerate.");
      setTimeout(() => router.push("/factory"), 2000);
    } catch (err) {
      showToast(String(err));
      setRevisioning(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0C0A09]">
      {/* Action bar */}
      <div
        className="flex items-center justify-between px-5 shrink-0 border-b border-white/10"
        style={{ height: 60, background: "#1C1917" }}
      >
        {/* Left */}
        <Link
          href="/factory"
          className="text-sm text-stone-400 hover:text-stone-200 transition-colors font-mono"
        >
          ← Back to Factory
        </Link>

        {/* Center */}
        <span
          className={`${cormorant.className} text-xl text-stone-100 tracking-wide`}
        >
          {slug}
        </span>

        {/* Right */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowRevisionInput((v) => !v);
            }}
            disabled={approving || revisioning}
            className="text-sm px-3 py-1.5 rounded border border-stone-600 text-stone-300 hover:border-stone-400 hover:text-stone-100 transition-colors disabled:opacity-40"
          >
            Request Revision
          </button>
          <button
            onClick={handleApprove}
            disabled={approving || revisioning}
            className="text-sm px-4 py-1.5 rounded bg-green-700 text-white hover:bg-green-600 transition-colors disabled:opacity-50 font-medium"
          >
            {approving ? "Approving..." : "Approve Design →"}
          </button>
        </div>
      </div>

      {/* Revision input panel */}
      {showRevisionInput && (
        <div className="shrink-0 bg-[#1C1917] border-b border-white/10 px-5 py-4 flex flex-col gap-3">
          <label className="text-sm text-stone-300 font-mono">
            Revision feedback for <span className="text-stone-100">{slug}</span>
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            placeholder="Describe what needs to change in the design..."
            className="w-full bg-[#0C0A09] border border-stone-700 rounded text-stone-200 text-sm px-3 py-2 placeholder-stone-600 focus:outline-none focus:border-stone-500 resize-none font-mono"
          />
          <div className="flex gap-3">
            <button
              onClick={handleRevisionSubmit}
              disabled={revisioning || !feedback.trim()}
              className="text-sm px-4 py-1.5 rounded bg-amber-700 text-white hover:bg-amber-600 transition-colors disabled:opacity-40 font-medium"
            >
              {revisioning ? "Submitting..." : "Submit Revision Request"}
            </button>
            <button
              onClick={() => setShowRevisionInput(false)}
              className="text-sm px-3 py-1.5 rounded border border-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* iframe */}
      <iframe
        src={`/api/factory/${slug}/design-preview`}
        style={{ width: "100%", flex: 1, border: "none", display: "block" }}
        title={`Design preview — ${slug}`}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-800 border border-stone-600 text-stone-100 text-sm px-5 py-3 rounded shadow-lg z-50 font-mono">
          {toast}
        </div>
      )}
    </div>
  );
}
