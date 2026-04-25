import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getClaudeCodeUsage } from '@/app/lib/openclaw-cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  
  const result: any = {
    timestamp: new Date().toISOString(),
    providers: {},
    duration_ms: 0,
  };

  // Claude Code - via ccusage (cached, async)
  result.providers['claude-code'] = await getClaudeCodeUsage();

  // OpenAI API
  try {
    const keyPath = join(process.env.HOME || '', '.openclaw/api-keys/openai.key');
    if (existsSync(keyPath)) {
      const apiKey = readFileSync(keyPath, 'utf8').trim();
      const today = new Date().toISOString().split('T')[0];
      
      const response = await fetch(`https://api.openai.com/v1/usage?date=${today}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        let totalTokens = 0;
        for (const entry of data.data || []) {
          totalTokens += (entry.n_context_tokens_total || 0) + (entry.n_completion_tokens_total || 0);
        }
        result.providers['openai-api'] = {
          status: 'ok',
          date: today,
          total_tokens: totalTokens,
        };
      } else {
        result.providers['openai-api'] = {
          status: 'error',
          error: `HTTP ${response.status}`,
        };
      }
    } else {
      result.providers['openai-api'] = {
        status: 'unavailable',
        error: 'No API key',
      };
    }
  } catch (e: any) {
    result.providers['openai-api'] = {
      status: 'error',
      error: e.message || 'Failed to fetch OpenAI usage',
    };
  }

  // Codex CLI - try CodexBar, fallback to unavailable
  result.providers['codex-cli'] = {
    status: 'unavailable',
    error: 'CodexBar CLI requires GUI app (XPC) - manual check at codexbar.app',
  };

  result.duration_ms = Date.now() - start;
  
  return NextResponse.json(result);
}
