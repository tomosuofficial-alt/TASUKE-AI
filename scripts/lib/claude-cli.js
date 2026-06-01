'use strict';

/**
 * Claude Code CLI を Node から呼び出す共通ラッパー。
 *
 * 目的: Gemini API（@google/genai）の代替。Anthropic 月額サブスク枠で動かす
 * ことで Google Cloud API 課金（特に NanoBanana 系画像生成）を回避する。
 *
 * 前提:
 *  - `claude` CLI が PATH に存在する（既存ログインの OAuth トークンを使う）
 *  - 構造化出力は `--json-schema` で強制（Gemini の responseSchema 相当）
 *  - 画像入力は `--add-dir` + Read tool 許可で取り込む
 *
 * 課金:
 *  - サブスクで使うなら追加課金ゼロ
 *  - `ANTHROPIC_API_KEY` を使う場合は `maxBudgetUsd` で上限を切ること
 */

const { spawn } = require('child_process');
const os = require('os');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
/**
 * claude を呼び出す時の cwd。プロジェクト直下で起動すると CLAUDE.md が
 * auto-discovery されて「ツカサ」ペルソナに引きずられ、構造化出力が崩れる。
 * tmpdir で起動して影響を遮断する。
 */
const CLAUDE_CWD = process.env.CLAUDE_CLI_CWD || os.tmpdir();

/**
 * @param {object} opts
 * @param {string} opts.prompt - ユーザープロンプト（stdin 経由で送る。ARG_MAX 回避）
 * @param {string} [opts.systemPrompt] - システムプロンプト（指定すると既定を完全上書き）
 * @param {object} [opts.schema] - JSON Schema。指定すると構造化出力を強制
 * @param {string} [opts.model='haiku'] - alias または full name（例: 'sonnet', 'claude-haiku-4-5-20251001'）
 * @param {string} [opts.allowReadDir] - Read tool を許可するディレクトリ（OCR等で画像を読ませる時に使用）
 * @param {number} [opts.maxBudgetUsd] - APIキー使用時の上限。サブスク利用時は不要
 * @param {number} [opts.timeoutMs=300000] - タイムアウト
 * @returns {Promise<{ result: any, raw: string, text: string, envelope: object }>}
 *   schema 指定時は result がパース済みオブジェクト、未指定時は本文文字列。
 */
function runClaude(opts = {}) {
  const {
    prompt,
    systemPrompt,
    schema,
    model = 'haiku',
    allowReadDir,
    maxBudgetUsd,
    timeoutMs = 300_000,
  } = opts;

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('runClaude: prompt は必須（string）');
  }

  const args = [
    '-p',
    '--output-format', 'json',
    '--model', model,
    '--no-session-persistence',
    '--disable-slash-commands',
    '--dangerously-skip-permissions',
    '--setting-sources', '',
  ];

  if (systemPrompt) {
    args.push('--system-prompt', systemPrompt);
  }
  if (schema) {
    args.push('--json-schema', JSON.stringify(schema));
  }
  // schema を渡すと内部的に StructuredOutput tool を強制呼び出しする。
  // それを Read 等と一緒に明示許可しないと、ツール不在で散文応答になる。
  const allowed = [];
  if (schema) allowed.push('StructuredOutput');
  if (allowReadDir) {
    args.push('--add-dir', allowReadDir);
    allowed.push('Read');
  }
  if (allowed.length > 0) {
    args.push('--allowedTools', allowed.join(','));
  } else {
    args.push('--tools', '');
  }
  if (typeof maxBudgetUsd === 'number') {
    args.push('--max-budget-usd', String(maxBudgetUsd));
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      cwd: CLAUDE_CWD,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
      reject(new Error(`claude CLI timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`claude exit ${code}: ${(stderr || stdout).slice(0, 800)}`));
      }
      let envelope;
      try {
        envelope = JSON.parse(stdout);
      } catch (e) {
        return reject(new Error(`envelope JSON parse failed: ${e.message}\n${stdout.slice(0, 400)}`));
      }
      const text = pickText(envelope);
      if (schema) {
        // --json-schema 使用時、構造化結果は envelope.structured_output に入る。
        // envelope.result はユーザー向けサマリ（散文）。
        const structured = envelope.structured_output;
        if (structured && typeof structured === 'object') {
          return resolve({ result: structured, raw: stdout, text, envelope });
        }
        // フォールバック: 古い CLI や schema 非対応モデルのために本文から抽出
        const parsed = parseJsonLoose(text);
        if (parsed) {
          return resolve({ result: parsed, raw: stdout, text, envelope });
        }
        return reject(new Error(`structured output not found in envelope.structured_output:\n${String(text).slice(0, 400)}`));
      }
      resolve({ result: text, raw: stdout, text, envelope });
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

function pickText(envelope) {
  if (envelope == null) return '';
  if (typeof envelope === 'string') return envelope;
  return (
    envelope.result ??
    envelope.text ??
    envelope.content ??
    envelope.message ??
    envelope.response ??
    ''
  );
}

function parseJsonLoose(text) {
  if (text == null) return null;
  if (typeof text === 'object') return text;
  let s = String(text).trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch (_) { /* fallthrough */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch (_) { /* fallthrough */ }
  }
  return null;
}

module.exports = { runClaude, parseJsonLoose };
