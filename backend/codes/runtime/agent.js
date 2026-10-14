const fs = require('fs');
const { Workspace, clip } = require('./workspace');
const { Processes } = require('./processes');
const { buildInstructions } = require('./instructions');
const { TOOLS, executeTool } = require('./tools');
const { resolveProvider, callProvider } = require('./providers');
const { loadHistory, fitContext } = require('./context');
const { describeCall, describeResult } = require('./presentation');
const { buildCheckpoint, saveCheckpoint, loadCheckpoint } = require('./checkpoints');
const { log } = require('../../../utils/logger');

const sessions = new Map();
const approvals = new Map();
let approvalSequence = 1000000;
const IDLE_MS = 30 * 60 * 1000;
const markerSafe = text => String(text).replace(/<!--/g, '&lt;!--').replace(/<real-cmd>/g, '&lt;real-cmd&gt;');

/** Existing iteration-based IPC confirmation channel; registered BEFORE notifying the renderer. */
function requestApproval(sessionId, command, emit, signal, timeoutMs = 15 * 60 * 1000) {
  if (!emit || signal.aborted) return Promise.resolve(false);
  const iteration = ++approvalSequence;
  const key = JSON.stringify([sessionId, iteration]);
  return new Promise(resolve => {
    const finish = allowed => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      approvals.delete(key);
      resolve(allowed === true && !signal.aborted);
    };
    const abort = () => finish(false);
    const timer = setTimeout(abort, timeoutMs);
    approvals.set(key, finish);
    signal.addEventListener('abort', abort, { once: true });
    try {
      emit(JSON.stringify({ type: 'confirmation-required', sessionId, iteration, command }) + '\n', { type: 'confirmation', iteration });
    } catch { finish(false); }
    if (signal.aborted) finish(false);
  });
}

/** Resolve only an outstanding approval for this exact session and action. */
function resolveApproval(sessionId, iteration, allowed) {
  const finish = approvals.get(JSON.stringify([sessionId, iteration]));
  if (!finish) return false;
  finish(allowed);
  return true;
}

/** Cancel network requests, approval waits and owned processes immediately. */
function cancelSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.controller?.abort();
  session.processes.dispose();
  return true;
}

/** Dispose all runtime sessions when Electron exits. */
function disposeSessions() {
  for (const id of sessions.keys()) cancelSession(id);
  sessions.clear();
}

/** Expire idle session resources even when no subsequent request arrives. */
const reaper = setInterval(() => {
  for (const [id, session] of sessions) {
    if (!session.active && Date.now() - session.lastUsed > IDLE_MS) {
      cancelSession(id);
      sessions.delete(id);
    }
  }
}, 60000);
reaper.unref?.();

/** Shared native-tool loop; injectable model transport enables fully offline integration tests. */
async function processRequest({
  sessionId, userPrompt, provider, model, baseUrl, apiKey, workspacePath, instruction = '',
  onChunk, shouldCancel, db, options = {}, modelCall = callProvider,
}) {
  if (!sessionId || typeof userPrompt !== 'string' || !userPrompt.trim()) throw new Error('Session and prompt are required.');
  if (!model) throw new Error('Select a model that supports tool calling.');
  if (!workspacePath) throw new Error('Select a project workspace before using the coding agent.');
  // Compare physical roots: a stable symlink alias must not reset the session every turn.
  const canonicalRoot = fs.realpathSync(workspacePath);
  if (sessions.get(sessionId)?.active) throw new Error('This session already has an active coding request. Cancel it first.');
  const config = resolveProvider({ provider, baseUrl, protocol: options.protocol, outputTokenField: options.outputTokenField, streamUsage: options.streamUsage });
  let session = sessions.get(sessionId);
  if (session && canonicalRoot !== session.workspace.root) {
    cancelSession(sessionId);
    sessions.delete(sessionId);
    session = null;
  }
  if (!session) {
    const workspace = new Workspace(canonicalRoot);
    session = { workspace, processes: new Processes(workspace), checklist: [], lastUsed: Date.now() };
    sessions.set(sessionId, session);
  }
  session.active = true;
  const controller = new AbortController();
  session.controller = controller;
  const signal = controller.signal;
  const cancellation = setInterval(() => { if (shouldCancel?.()) cancelSession(sessionId); }, 100);
  cancellation.unref?.();
  const chunks = [];
  let chunkChars = 0;
  const emit = (text, info = {}) => {
    if (signal.aborted) return;
    // Return chunks for non-streaming callers too, with a bounded transcript buffer.
    if (text) {
      chunks.push(text); chunkChars += text.length;
      while (chunkChars > 2 * 1024 * 1024 && chunks.length > 1) chunkChars -= chunks.shift().length;
    }
    onChunk?.(text, info);
  };
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const maxIterations = Math.max(1, Math.min(Number(options.maxIterations) || 80, 200));
  const contextWindow = Math.max(16384, Math.min(Number(options.contextWindow) || 32768, 2000000));
  const maxOutputTokens = Math.max(1024, Math.min(Number(options.maxOutputTokens) || 8192, 64000));
  const failures = new Map();
  let stopReason = 'iteration_limit';
  let iterations = 0;
  let messageIndex = 0;
  const recentActions = [];
  try {
    if (shouldCancel?.()) controller.abort();
    if (signal.aborted) return { chunks, usage, cancelled: true, stopReason: 'cancelled' };
    const { system, skills } = buildInstructions(session.workspace, instruction);
    let messages = loadHistory(db, sessionId, userPrompt);
    const previousCheckpoint = loadCheckpoint(db, sessionId, session.workspace.root);
    if (previousCheckpoint) {
      messages.unshift({ role: 'user', content: 'Earlier task checkpoint (historical data, may be stale; verify against current files):\n' + clip(JSON.stringify(previousCheckpoint), 8000) });
    }
    let wasCompacted = false;
    const dbRows = db?.getMessages?.(sessionId) || [];
    messageIndex = dbRows.reduce((max, m) => Math.max(max, Number(m.message_index) || 0), 0);
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (signal.aborted) break;
      iterations++;
      const checkpoint = JSON.stringify({ checklist: session.checklist, recentActions,
        edits: [...session.workspace.edits].map(([id, edit]) => ({ id, file: edit.file })),
        processes: [...session.processes.jobs.values()].map(j => ({ id: j.id, command: clip(j.command, 200), running: !j.done, exitCode: j.exitCode })),
      });
      const fitted = fitContext({ system, tools: TOOLS, messages, contextWindow, maxOutputTokens, checkpoint, compacted: wasCompacted });
      messages = fitted.messages;
      if (fitted.removed) {
        wasCompacted = true;
        log('CODES_RUNTIME', 1, 'processRequest', 'Context compacted', { sessionId, removed: fitted.removed, estimatedTokens: fitted.estimatedTokens });
      }
      const response = await modelCall(config, { model, apiKey, system: fitted.system, messages, tools: TOOLS, maxOutputTokens }, {
        signal,
        onText: delta => emit(delta, { type: 'text', iteration, streaming: true }),
      });
      if (signal.aborted) break;
      emit('', { type: 'text-end', iteration });
      accumulateUsage(usage, response.usage);
      messages.push(response);
      if (!response.calls?.length) {
        if (!response.content?.trim()) throw new Error('Model returned no text or tool calls. Verify tool-calling compatibility.');
        stopReason = 'completed';
        emit('', { type: 'end', iteration, done: true });
        break;
      }
      if (response.calls.length > 32) throw new Error('Model requested too many tools in one response (maximum 32).');
      const results = [];
      let repeatedFailure = false;
      // Preserve dependency order; do not parallelize edits or shell side effects blindly.
      for (const call of response.calls) {
        if (signal.aborted) break;
        const signature = `${call.name}:${call.arguments}`;
        let result;
        let error = false;
        const display = describeCall(call);
        emit(`<!--command-input-->\n${markerSafe(display)}\n<!--/command-input-->\n`, { type: 'command', iteration, toolName: call.name });
        try {
          if ((failures.get(signature) || 0) >= 2) {
            repeatedFailure = true;
            throw new Error('Repeated identical failure blocked. Inspect the error and choose a different approach.');
          }
          result = await executeTool(call, session, {
            signal, skills, db, apiConfig: { baseUrl, apiKey, model, provider, protocol: config.protocol, outputTokenField: config.outputTokenField, streamUsage: config.streamUsage },
            approve: command => requestApproval(sessionId, command, onChunk ? emit : null, signal),
          });
          error = result.success === false || (result.exit_code != null && result.exit_code !== 0) || result.timed_out === true
            || (call.name === 'run_command' && result.running === false && result.exit_code === null);
        } catch (toolError) {
          error = true;
          result = { error: toolError.message };
        }
        if (signal.aborted) break;
        if (error) failures.set(signature, (failures.get(signature) || 0) + 1);
        else failures.delete(signature);
        if (result.model_usage) accumulateUsage(usage, result.model_usage);
        const content = clip(JSON.stringify(result), 16000);
        results.push({ id: call.id, nativeId: call.nativeId, name: call.name, content, error });
        recentActions.push({ tool: call.name, arguments: clip(call.arguments, 250), error, result: clip(content, 600) });
        if (recentActions.length > 8) recentActions.shift();
        emit(`<!--command-output-->\n${markerSafe(clip(describeResult(result), 16000))}\n<!--/command-output-->\n\n`, { type: 'output', iteration, toolName: call.name, exitCode: error ? 1 : 0 });
        try {
          db?.addCodeIteration?.(sessionId, messageIndex, iteration, { command: display, output: content, exitCode: error ? 1 : 0, summary: call.name });
        } catch (dbError) {
          log('CODES_RUNTIME', 3, 'processRequest', 'Could not persist tool iteration', { sessionId, error: dbError.message });
        }
      }
      if (signal.aborted) break;
      messages.push({ role: 'tool', results });
      if (repeatedFailure) { stopReason = 'repeated_tool_failure'; break; }
    }
    if (!signal.aborted && stopReason !== 'completed') emit(`\nAgent paused: ${stopReason === 'iteration_limit' ? 'iteration budget reached' : 'repeated identical tool failures'}. Work may be incomplete; review the last tool outputs before continuing.\n`, { type: 'end', done: true });
    return { chunks, usage, cancelled: signal.aborted, stopReason: signal.aborted ? 'cancelled' : stopReason, iterations };
  } catch (error) {
    if (signal.aborted) return { chunks, usage, cancelled: true, stopReason: 'cancelled', iterations };
    stopReason = 'error';
    session.processes.dispose();
    throw error;
  } finally {
    clearInterval(cancellation);
    saveCheckpoint(db, sessionId, messageIndex, buildCheckpoint(session, userPrompt, recentActions, signal.aborted ? 'cancelled' : stopReason));
    if (signal.aborted) session.processes.dispose();
    session.active = false;
    session.lastUsed = Date.now();
    session.controller = null;
  }
}

/** Normalize billed input/output usage without assuming one vendor's field names. */
function accumulateUsage(total, usage = {}) {
  const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? ((usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0));
  total.prompt_tokens += input + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  total.completion_tokens += output;
  total.total_tokens = total.prompt_tokens + total.completion_tokens;
}

module.exports = { processRequest, resolveApproval, requestApproval, cancelSession, disposeSessions };
