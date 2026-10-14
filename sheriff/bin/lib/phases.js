'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { readFile, writeFile, safePath, validateId, PHASES_FILE } = require('./state');
const { withLock } = require('./lock');

const STATUS = { PENDING: '[ ]', IN_PROGRESS: '🔒', PASS: '✅', FAIL: '❌', REVIEW: '⚠️' };
const icons = { pending: '[ ]', in_progress: '🔒', pass: '✅', fail: '❌', review: '⚠️' };
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseSubphases(content) {
  const headings = [...content.matchAll(/^### ([1-9]\d*\.[1-9]\d*)(?=\s|$)[^\n]*$/gm)];
  const seen = new Set();
  return headings.map((match, index) => {
    const id = match[1];
    if (seen.has(id)) throw new Error(`Duplicate subphase ID: ${id}`);
    seen.add(id);
    const start = match.index;
    const next = headings[index + 1]?.index ?? content.length;
    const tail = content.slice(start, next);
    const boundary = tail.search(/\n## /);
    const end = boundary < 0 ? next : start + boundary;
    const block = content.slice(start, end);
    const metadata = block.match(/^```[^\n]*\n([\s\S]*?)^```/m)?.[1] || '';
    const field = key => metadata.match(new RegExp(`^${key}:[ \t]*([^\\n]*)`, 'm'))?.[1].trim();
    const legacy = content.match(new RegExp(`^\\|\\s*${escapeRegex(id)}\\s*\\|[^|]*\\|\\s*([^|]*)\\|`, 'm'))?.[1].trim();
    let status = field('status');
    if (!status) status = Object.keys(icons).find(key => legacy?.startsWith(icons[key])) || (field('lock') && field('lock') !== '—' ? 'in_progress' : 'pending');
    if (!Object.hasOwn(icons, status)) throw new Error(`Invalid status for ${id}: ${status}`);
    return { id, start, end, block, status, wave: Number(field('wave')), agentId: field('lock') || '—', lockTime: field('lock_time') || '—' };
  });
}

function setField(block, key, value) {
  const fence = block.match(/^```[^\n]*\n([\s\S]*?)^```/m);
  if (!fence) throw new Error('Subphase metadata block missing');
  const pattern = new RegExp(`^${key}:[^\\n]*`, 'm');
  const metadata = pattern.test(fence[1]) ? fence[1].replace(pattern, () => `${key}: ${value}`) : `${fence[1]}${key}: ${value}\n`;
  return block.slice(0, fence.index) + fence[0].replace(fence[1], () => metadata) + block.slice(fence.index + fence[0].length);
}

function updateProgress(content) {
  const phases = parseSubphases(content);
  return content.split('\n').map(line => {
    if (!/^\|/.test(line)) return line;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    const number = cells[0]?.match(/^(?:Phase )?([1-9]\d*)(?:\s.*)?$/)?.[1];
    if (!number || cells.length < 4) return line;
    const children = phases.filter(phase => phase.id.split('.')[0] === number);
    if (!children.length) return line;
    const finished = children.filter(phase => ['pass', 'fail', 'review'].includes(phase.status)).length;
    const status = children.some(phase => phase.status === 'in_progress') ? 'in_progress'
      : finished < children.length ? 'pending'
      : children.some(phase => phase.status === 'fail') ? 'fail'
      : children.some(phase => phase.status === 'review') ? 'review' : 'pass';
    cells[2] = icons[status];
    cells[3] = `${finished} / ${children.length}`;
    return `| ${cells.join(' | ')} |`;
  }).join('\n');
}

function mutate(subphaseId, cwd, update) {
  validateId(subphaseId, 'subphase');
  return withLock('.sheriff/.phases.lock', cwd, () => {
    const content = readFile(PHASES_FILE, cwd);
    if (!content) throw new Error('PHASES.md not found');
    const phase = parseSubphases(content).find(item => item.id === subphaseId);
    if (!phase) return { success: false, reason: 'subphase not found', subphaseId };
    const change = update(phase);
    if (change.success === false) return change;
    let block = phase.block;
    for (const [key, value] of Object.entries(change.fields)) block = setField(block, key, value);
    let updated = content.slice(0, phase.start) + block + content.slice(phase.end);
    // Preserve the optional table used by older plans.
    const row = new RegExp(`^(\\|\\s*${escapeRegex(subphaseId)}\\s*\\|[^|]*\\|)\\s*[^|]*\\|`, 'm');
    updated = updated.replace(row, (_, prefix) => `${prefix} ${icons[change.fields.status]} |`);
    updated = updateProgress(updated);
    const archives = (change.archive || []).map(file => ({
      original: safePath(file, cwd),
      archived: safePath(`.sheriff/archive/${path.basename(file, '.md')}-${randomUUID()}.md`, cwd),
    })).filter(item => fs.existsSync(item.original));
    const moved = [];
    try {
      for (const item of archives) {
        fs.mkdirSync(path.dirname(item.archived), { recursive: true });
        fs.renameSync(item.original, item.archived);
        moved.push(item);
      }
      writeFile(PHASES_FILE, updated, cwd);
    } catch (error) {
      for (const item of moved.reverse()) {
        try { fs.renameSync(item.archived, item.original); }
        catch (restoreError) { error.message += `; recovery needed at ${item.archived}: ${restoreError.message}`; }
      }
      throw error;
    }
    return { success: true, subphaseId, ...change.result };
  });
}

function claimSubphase(subphaseId, agentId, cwd = process.cwd()) {
  validateId(agentId);
  return mutate(subphaseId, cwd, phase => {
    if (phase.status !== 'pending') return { success: false, reason: 'subphase not available' };
    const lockTime = new Date().toISOString();
    return { fields: { status: 'in_progress', lock: agentId, lock_time: lockTime }, result: { agentId, lockTime } };
  });
}

function getSafeToRelease(subphaseId, cwd = process.cwd()) {
  validateId(subphaseId, 'subphase');
  if (readFile(`.sheriff/results/${subphaseId.replace('.', '-')}.md`, cwd) !== null) return { safe: false, reason: 'result_exists' };
  const dir = safePath('.sheriff/handoffs', cwd);
  if (fs.existsSync(dir)) {
    const mention = new RegExp(`(^|[^\\d.])${escapeRegex(subphaseId)}(?=$|[^\\d.])`);
    for (const file of fs.readdirSync(dir).filter(file => /^handoff-.*\.md$/.test(file))) {
      if (file === `handoff-${subphaseId}.md` || mention.test(readFile(`.sheriff/handoffs/${file}`, cwd))) return { safe: false, reason: 'handoff_exists' };
    }
  }
  return { safe: true };
}

function releaseSubphase(subphaseId, cwd = process.cwd(), force = false) {
  return mutate(subphaseId, cwd, phase => {
    if (phase.status !== 'in_progress' && !force) return { success: false, reason: 'subphase not locked' };
    const archive = force && ['pass', 'fail', 'review'].includes(phase.status)
      ? [`.sheriff/results/${subphaseId.replace('.', '-')}.md`, `.sheriff/summaries/phase-${subphaseId.split('.')[0]}.md`] : [];
    const safety = force ? { safe: true } : getSafeToRelease(subphaseId, cwd);
    if (!safety.safe) return { success: false, subphaseId, reason: safety.reason };
    return { fields: { status: 'pending', lock: '—', lock_time: '—' }, archive };
  });
}

function markComplete(subphaseId, result, cwd = process.cwd()) {
  if (!['pass', 'fail', 'review'].includes(result)) throw new Error('result must be pass, fail, or review');
  return mutate(subphaseId, cwd, () => ({ fields: { status: result, lock: '—', lock_time: '—' }, result: { result: icons[result] } }));
}

function getStaleLocks(cwd = process.cwd()) {
  const content = readFile(PHASES_FILE, cwd);
  if (!content) return [];
  const staleMins = require('./config').readConfig(cwd)?.staleLockMinutes ?? 30;
  return parseSubphases(content).filter(phase => phase.status === 'in_progress' && (!Number.isFinite(Date.parse(phase.lockTime)) || Date.parse(phase.lockTime) < Date.now() - staleMins * 60000))
    .map(({ id, agentId, lockTime }) => ({ subphaseId: id, agentId, lockTime }));
}

function getOrphanedLockFiles(cwd = process.cwd()) {
  return ['.sheriff/.phases.lock', '.sheriff/.testmap.lock', '.sheriff/.git.lock'].flatMap(file => {
    const content = readFile(file, cwd);
    if (content === null) return [];
    const pid = Number(content.split('|')[0]);
    let alive = false;
    if (Number.isSafeInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); alive = true; } catch (error) { alive = error.code === 'EPERM'; }
    }
    return [{ file, pid: Number.isSafeInteger(pid) && pid > 0 ? pid : null, alive }];
  });
}

function getNextAvailableSubphase(wave, cwd = process.cwd()) {
  const content = readFile(PHASES_FILE, cwd);
  return content ? parseSubphases(content).find(phase => phase.wave === Number(wave) && phase.status === 'pending')?.id ?? null : null;
}

module.exports = { claimSubphase, releaseSubphase, markComplete, getStaleLocks, getSafeToRelease, getOrphanedLockFiles, getNextAvailableSubphase, parseSubphases, STATUS };
