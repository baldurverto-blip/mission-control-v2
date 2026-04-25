'use client';

import { useEffect, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InsightRow {
  id: string;
  title: string;
  tldr: string;
  gmfcs_levels: number[];
  country_code: string | null;
  updated_at: string;
  is_published: boolean;
}

interface BenefitRow {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  gmfcs_relevance: number[] | null;
  municipality_discretion: boolean;
  law_ref: string | null;
  country_code: string | null;
  updated_at: string;
  is_published: boolean;
}

type Tab = 'insights' | 'benefits';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gmfcsLabel(levels: number[] | null): string {
  if (!levels || levels.length === 0) return 'All';
  if (levels.length === 5) return 'All';
  return levels.map(l => `${l}`).join(', ');
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EirKnowledgePage() {
  const [tab, setTab]               = useState<Tab>('insights');
  const [insights, setInsights]     = useState<InsightRow[]>([]);
  const [benefits, setBenefits]     = useState<BenefitRow[]>([]);
  const [loading, setLoading]       = useState(false);
  const [acting, setActing]         = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const fetchPending = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/eir/knowledge?table=${t}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (t === 'insights') setInsights(json.rows ?? []);
      else setBenefits(json.rows ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending(tab);
  }, [tab, fetchPending]);

  async function act(id: string, action: 'approve' | 'reject') {
    if (!confirm(action === 'reject'
      ? `Reject "${id}"? This deletes it from Supabase (wiki file stays).`
      : `Approve "${id}"? It will go live in the app.`
    )) return;

    setActing(id);
    try {
      const res = await fetch('/api/eir/knowledge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, table: tab, action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchPending(tab);
    } catch (e) {
      alert(`Action failed: ${(e as Error).message}`);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--charcoal)' }}>
          Eir — Knowledge Approval
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid)' }}>
          Pages queued by{' '}
          <code
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ background: 'var(--warm)', color: 'var(--charcoal)' }}
          >
            wiki-publish
          </code>
          . Approve to go live in the app. Reject to discard (wiki file remains).
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b" style={{ borderColor: 'var(--warm)' }}>
        {(['insights', 'benefits'] as Tab[]).map(t => {
          const active = tab === t;
          const count = t === 'insights' ? insights.length : benefits.length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors"
              style={{
                borderColor: active ? 'var(--terracotta)' : 'transparent',
                color: active ? 'var(--charcoal)' : 'var(--muted)',
              }}
            >
              {t}
              {count > 0 && (
                <span
                  className="ml-2 px-1.5 py-0.5 text-xs rounded-full"
                  style={{
                    background: active ? 'var(--terracotta-bg)' : 'var(--warm)',
                    color: active ? 'var(--terracotta)' : 'var(--mid)',
                    border: `1px solid ${active ? 'var(--terracotta-border)' : 'var(--warm)'}`,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* States */}
      {error && (
        <div
          className="mb-4 p-3 rounded-md text-sm"
          style={{ background: 'var(--terracotta-bg)', color: 'var(--terracotta)', border: '1px solid var(--terracotta-border)' }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm py-8 text-center" style={{ color: 'var(--muted)' }}>Loading...</div>
      )}

      {!loading && (tab === 'insights' ? insights : benefits).length === 0 && !error && (
        <div className="text-sm py-12 text-center" style={{ color: 'var(--muted)' }}>
          No pending {tab}. Queue is clear.
        </div>
      )}

      {/* Insights table */}
      {!loading && tab === 'insights' && insights.length > 0 && (
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: 'var(--paper)', boxShadow: 'var(--shadow-card)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--warm)' }}>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>ID</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Title</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>GMFCS</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Country</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Updated</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {insights.map((row, i) => (
                <tr
                  key={row.id}
                  className="transition-colors"
                  style={{
                    borderBottom: i < insights.length - 1 ? '1px solid var(--warm)' : undefined,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--raised)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--muted)' }}>{row.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium leading-snug" style={{ color: 'var(--charcoal)' }}>{row.title}</div>
                    <div className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--muted)' }}>{row.tldr}</div>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--mid)' }}>{gmfcsLabel(row.gmfcs_levels)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--mid)' }}>{row.country_code ?? 'intl'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{relativeTime(row.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => act(row.id, 'approve')}
                        disabled={acting === row.id}
                        className="px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
                        style={{ background: 'var(--olive)', color: 'var(--paper)', border: '1px solid var(--olive)' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => act(row.id, 'reject')}
                        disabled={acting === row.id}
                        className="px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
                        style={{ background: 'var(--paper)', color: 'var(--mid)', border: '1px solid var(--warm)' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--terracotta-border)'; e.currentTarget.style.color = 'var(--terracotta)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--warm)'; e.currentTarget.style.color = 'var(--mid)'; }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Benefits table */}
      {!loading && tab === 'benefits' && benefits.length > 0 && (
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: 'var(--paper)', boxShadow: 'var(--shadow-card)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--warm)' }}>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>ID</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Title</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Category</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Difficulty</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>GMFCS</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Country</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Ref</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--muted)' }}>Updated</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {benefits.map((row, i) => (
                <tr
                  key={row.id}
                  className="transition-colors"
                  style={{
                    borderBottom: i < benefits.length - 1 ? '1px solid var(--warm)' : undefined,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--raised)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--muted)' }}>{row.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium leading-snug" style={{ color: 'var(--charcoal)' }}>{row.title}</div>
                    {row.municipality_discretion && (
                      <span className="text-xs" style={{ color: 'var(--terracotta)' }}>varies by kommune</span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize" style={{ color: 'var(--mid)' }}>{row.category}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={
                        row.difficulty === 'easy'     ? { background: 'var(--olive-bg)', color: 'var(--olive)', border: '1px solid var(--olive-border)' }
                      : row.difficulty === 'complex'  ? { background: 'var(--terracotta-bg)', color: 'var(--terracotta)', border: '1px solid var(--terracotta-border)' }
                      :                                 { background: 'var(--warm)', color: 'var(--mid)', border: '1px solid var(--warm)' }
                      }
                    >
                      {row.difficulty}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--mid)' }}>{gmfcsLabel(row.gmfcs_relevance)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--mid)' }}>{row.country_code ?? 'intl'}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--muted)' }}>{row.law_ref ?? '—'}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{relativeTime(row.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => act(row.id, 'approve')}
                        disabled={acting === row.id}
                        className="px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
                        style={{ background: 'var(--olive)', color: 'var(--paper)', border: '1px solid var(--olive)' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => act(row.id, 'reject')}
                        disabled={acting === row.id}
                        className="px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
                        style={{ background: 'var(--paper)', color: 'var(--mid)', border: '1px solid var(--warm)' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--terracotta-border)'; e.currentTarget.style.color = 'var(--terracotta)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--warm)'; e.currentTarget.style.color = 'var(--mid)'; }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
