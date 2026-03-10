'use client';

import { useEffect, useState } from 'react';

interface UsageData {
  timestamp: string;
  providers: {
    'claude-code'?: {
      status: string;
      date?: string;
      input_tokens?: number;
      output_tokens?: number;
      cache_read_tokens?: number;
      total_tokens?: number;
      total_cost?: number;
      models?: string[];
      error?: string;
    };
    'openai-api'?: {
      status: string;
      date?: string;
      total_tokens?: number;
      total_cost?: number;
      error?: string;
    };
    'codex-cli'?: {
      status: string;
      error?: string;
    };
  };
  duration_ms: number;
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/usage')
      .then(res => res.json())
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">AI Usage Dashboard</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">AI Usage Dashboard</h1>
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  const claude = data?.providers['claude-code'];
  const openai = data?.providers['openai-api'];
  const codex = data?.providers['codex-cli'];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">AI Usage Dashboard</h1>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
        >
          Refresh
        </button>
      </div>

      <p className="text-gray-500 text-sm mb-6">
        Last updated: {data?.timestamp}
      </p>

      {/* Claude Code */}
      <div className="bg-white border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Claude Code</h2>
          <span className={`px-3 py-1 rounded-full text-sm ${
            claude?.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {claude?.status}
          </span>
        </div>
        
        {claude?.status === 'ok' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-gray-500 text-sm">Input Tokens</p>
              <p className="text-2xl font-mono">{(claude.input_tokens || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Output Tokens</p>
              <p className="text-2xl font-mono">{(claude.output_tokens || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Cache Reads</p>
              <p className="text-2xl font-mono">{(claude.cache_read_tokens || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Total Cost</p>
              <p className="text-2xl font-mono text-green-600">${(claude.total_cost || 0).toFixed(2)}</p>
            </div>
          </div>
        ) : (
          <p className="text-red-500">{claude?.error}</p>
        )}

        {claude?.models && claude.models.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-gray-500 text-sm">Models used:</p>
            <div className="flex gap-2 mt-2">
              {claude.models.map((model: string) => (
                <span key={model} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                  {model}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* OpenAI API */}
      <div className="bg-white border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">OpenAI API</h2>
          <span className={`px-3 py-1 rounded-full text-sm ${
            openai?.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {openai?.status}
          </span>
        </div>
        
        {openai?.status === 'ok' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-gray-500 text-sm">Total Tokens</p>
              <p className="text-2xl font-mono">{(openai.total_tokens || 0).toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">
            {openai?.error || 'No usage data (subscription account)'}
          </p>
        )}
      </div>

      {/* Codex CLI */}
      <div className="bg-white border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">OpenAI Codex CLI</h2>
          <span className="px-3 py-1 rounded-full text-sm bg-yellow-100 text-yellow-700">
            Manual check
          </span>
        </div>
        <p className="text-gray-500">
          CodexBar app required. Download at{' '}
          <a 
            href="https://codexbar.app" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            codexbar.app
          </a>
        </p>
      </div>
    </div>
  );
}
