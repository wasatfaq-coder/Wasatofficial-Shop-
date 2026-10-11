#!/usr/bin/env node
/**
 * Точная стоимость сессии для cost-tracker ECC (решение владельца 11.10: ECC без правок, но без помех в работе).
 *
 * cost-tracker ECC (scripts/hooks/cost-tracker.js) пишет строки ~/.claude/metrics/costs.jsonl; из них же берут сумму
 * предупреждения «COST WARNING» (ecc-metrics-bridge → ecc-context-monitor) и /ecc:cost-report. Своя таблица цен ECC 2.2.3
 * устарела: Opus 5.5 — по $5/$25 и кэшу $0,50 (на деле $4/$20 и $0,20), Haiku 5.5 — по $1/$5 (на деле $0,10/$0,50), запись
 * в часовой кэш — как в 5-минутный. Поэтому ECC сам предусмотрел точное значение — «harness-cost contract» в заголовке
 * cost-tracker.js: если `<tmpdir>/harness-cost-<сессия>.json` ({ts, cost_usd}) свежее 300 с, строка берёт его. Пишет его,
 * по замыслу ECC, строка состояния, но в облачной сессии Claude Code её не вызывает (проверено 11.10).
 *
 * Этот хук (Stop, `.claude/settings.json`) считает стоимость по журналу сессии и журналам её субагентов теми же правилами,
 * что cost-tracker (один раз на message.id), по ценам ниже, пишет файл и сразу запускает cost-tracker ECC с тем же stdin — по очереди, а не
 * одновременно: штатный запуск cost-tracker выключен в ECC_DISABLED_HOOKS (`stop:cost-tracker`). Файлы ECC не меняются.
 * Модель не из таблицы (или незнакомая скорость) — файл убирается, и cost-tracker считает по-своему, как без хука.
 * Поиск в интернете (web_search_requests) не считается.
 * Ошибка хука работу не останавливает: Stop всегда завершается кодом 0 и ничего не печатает.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Цены за 1M токенов, USD. Сверены 11.10 со стоимостью, которую Claude Code сам считает по прейскуранту (costUSD,
// costBasis «list» в итоге `claude -p --output-format json`), — совпадение до цента. Запись в кэш: 5 мин — ×1,25 входа,
// 1 ч — ×2 (Claude Code пишет часовой). Haiku 5.5: промпт (вход + чтение и запись кэша) больше 100K — свои цены.
const PRICES = {
  'claude-opus-5-5': [{ in: 4, out: 20, read: 0.2, write5m: 5, write1h: 8 }],
  'claude-sonnet-5-5': [{ in: 2, out: 10, read: 0.1, write5m: 2.5, write1h: 4 }],
  'claude-haiku-5-5': [
    { upTo: 100000, in: 0.1, out: 0.5, read: 0.01, write5m: 0.125, write1h: 0.2 },
    { in: 0.5, out: 2.5, read: 0.05, write5m: 0.625, write1h: 1 },
  ],
};
// Записи журнала без вызова модели (сообщения, которые Claude Code вставляет сам) — без стоимости.
const SYNTHETIC_MODELS = new Set(['<synthetic>']);

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function eccRoot() {
  try {
    const file = path.join(os.homedir(), '.claude/plugins/installed_plugins.json');
    const entries = JSON.parse(fs.readFileSync(file, 'utf8')).plugins['ecc@ecc'] || [];
    const entry = entries.find(e => e.installPath && fs.existsSync(path.join(e.installPath, 'scripts/hooks/cost-tracker.js')));
    return entry ? entry.installPath : null;
  } catch {
    return null;
  }
}

/** Стоимость одного ответа модели или null, если цен этой модели (или скорости) нет. */
function messageCost(model, usage) {
  const tiers = PRICES[model];
  if (!tiers || (usage.speed && usage.speed !== 'standard')) return null;
  const input = count(usage.input_tokens);
  const read = count(usage.cache_read_input_tokens);
  const write = count(usage.cache_creation_input_tokens);
  const split = usage.cache_creation || {};
  const write1h = Math.min(count(split.ephemeral_1h_input_tokens), write);
  const write5m = write - write1h;
  const prompt = input + read + write;
  const rate = tiers.find(t => t.upTo === undefined || prompt <= t.upTo);
  return (input * rate.in + count(usage.output_tokens) * rate.out + read * rate.read
    + write5m * rate.write5m + write1h * rate.write1h) / 1e6;
}

/** Ответы модели из журнала: один раз на message.id (последняя строка), как в cost-tracker ECC. */
function collectUsage(transcriptPath, usageById) {
  let line = 0;
  for (const text of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
    line += 1;
    if (!text.trim()) continue;
    let entry;
    try { entry = JSON.parse(text); } catch { continue; }
    const message = entry.type === 'assistant' && entry.message;
    if (!message || !message.usage) continue;
    const key = typeof message.id === 'string' && message.id ? message.id : `${transcriptPath}:${line}`;
    usageById.set(key, { model: message.model, usage: message.usage });
  }
}

/**
 * Стоимость сессии: основной журнал и журналы субагентов (`<сессия>/subagents/*.jsonl` — в счёт Claude Code они входят,
 * а в основной журнал не попадают). null — в сессии есть модель или скорость не из таблицы цен.
 */
function sessionCost(transcriptPath) {
  const usageById = new Map();
  collectUsage(transcriptPath, usageById);
  const subagents = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  if (fs.existsSync(subagents)) {
    for (const name of fs.readdirSync(subagents)) {
      if (name.endsWith('.jsonl')) collectUsage(path.join(subagents, name), usageById);
    }
  }
  let total = 0;
  for (const { model, usage } of usageById.values()) {
    if (SYNTHETIC_MODELS.has(model)) continue;
    const cost = messageCost(model, usage);
    if (cost === null) return null;
    total += cost;
  }
  return Math.round(total * 1e6) / 1e6;
}

function publishCost(root, input) {
  const { sanitizeSessionId } = require(path.join(root, 'scripts/lib/session-bridge'));
  const sessionId = sanitizeSessionId(input.session_id);
  const transcript = typeof input.transcript_path === 'string' ? input.transcript_path : '';
  if (!sessionId || !transcript || !fs.existsSync(transcript)) return;
  const file = path.join(os.tmpdir(), `harness-cost-${sessionId}.json`);
  const cost = sessionCost(transcript);
  if (cost === null) {
    // Файл прошлого Stop (свежее 300 с) cost-tracker взял бы вместо своей таблицы — убрать, пусть считает сам.
    fs.rmSync(file, { force: true });
    return;
  }
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ ts: Math.floor(Date.now() / 1000), cost_usd: cost }));
  fs.renameSync(`${file}.tmp`, file);
}

function main() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return; }
  const root = eccRoot();
  if (!root) return;
  try {
    publishCost(root, raw.trim() ? JSON.parse(raw) : {});
  } catch (error) {
    process.stderr.write(`ecc-cost-tracker: точная стоимость не записана (${error.message}) — cost-tracker посчитает сам\n`);
  }
  // cost-tracker ECC — тем же stdin; его вывод (эхо stdin по правилам ECC) Claude Code не нужен.
  spawnSync(process.execPath, [path.join(root, 'scripts/hooks/cost-tracker.js')], {
    input: raw, // больше 1 МБ cost-tracker обрежет сам и ничего не напечатает
    stdio: ['pipe', 'ignore', 'inherit'],
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: root },
    timeout: 25000,
  });
}

if (require.main === module) {
  try { main(); } catch { /* Stop не должен падать */ }
  process.exit(0);
}

module.exports = { messageCost, sessionCost };
