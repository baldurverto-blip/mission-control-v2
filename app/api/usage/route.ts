import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  
  const result: any = {
    timestamp: new Date().toISOString(),
    providers: {},
    duration_ms: 0,
  };

  // Claude Code - via ccusage
  try {
    const output = execSync('npx -y ccusage daily --json 2>/dev/null', {
      encoding: 'utf8',
      timeout: 30000,
    });
    
    if (output.trim().startsWith('{')) {
      const data = JSON.parse(output);
      const today = new Date().toISOString().split('T')[0];
      const todayData = data.daily?.find((d: any) => d.date === today);
      const latestData = data.daily?.[data.daily.length - 1];
      
      result.providers['claude-code'] = {
        status: 'ok',
        date: todayData?.date || latestData?.date || today,
        input_tokens: todayData?.inputTokens || latestData?.inputTokens || 0,
        output_tokens: todayData?.outputTokens || latestData?.outputTokens || 0,
        cache_creation_tokens: todayData?.cacheCreationTokens || latestData?.cacheCreationTokens || 0,
        cache_read_tokens: todayData?.cacheReadTokens || latestData?.cacheReadTokens || 0,
        total_tokens: todayData?.totalTokens || latestData?.totalTokens || 0,
        total_cost: todayData?.totalCost || latestData?.totalCost || 0,
        models: todayData?.modelsUsed || latestData?.modelsUsed || [],
      };
    }
  } catch (e: any) {
    result.providers['claude-code'] = {
      status: 'error',
      error: e.message || 'Failed to fetch Claude Code usage',
    };
  }

  // OpenAI API
  try {
    const keyPath = join(process.env.HOME || '', '.openclaw/api-keys/openai.key');
    if (existsSync(keyPath)) {
      const apiKey = require('fs').readFileSync(keyPath, 'utf8').trim();
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
