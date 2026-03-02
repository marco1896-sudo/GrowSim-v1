export const DEFAULT_CHUNK_SIZE = 300;

export function computeElapsedTicks({ nowUnixTs, lastWallclockUnixTs, tickSeconds }) {
  const elapsedSeconds = Math.max(0, nowUnixTs - lastWallclockUnixTs);
  const ticks = Math.floor(elapsedSeconds / tickSeconds);
  const remainderSeconds = elapsedSeconds - ticks * tickSeconds;

  return {
    elapsedSeconds,
    ticks,
    remainderSeconds
  };
}

export function buildTickChunks(totalTicks, chunkSize = DEFAULT_CHUNK_SIZE) {
  const chunks = [];
  let remaining = Math.max(0, totalTicks);
  while (remaining > 0) {
    const step = Math.min(chunkSize, remaining);
    chunks.push(step);
    remaining -= step;
  }
  return chunks;
}

export function processOfflineTicks({ state, nowUnixTs, onTickBatch, chunkSize = DEFAULT_CHUNK_SIZE }) {
  const tickSeconds = state.tick_seconds;
  const lastWallclockUnixTs = state.last_wallclock_unix_ts;
  const { ticks } = computeElapsedTicks({ nowUnixTs, lastWallclockUnixTs, tickSeconds });

  if (ticks <= 0) {
    state.offline_backlog_ticks = 0;
    state.last_wallclock_unix_ts = nowUnixTs;
    return { processedTicks: 0, chunks: 0 };
  }

  const chunks = buildTickChunks(ticks, chunkSize);
  state.offline_backlog_ticks = ticks;

  for (const chunkTicks of chunks) {
    if (typeof onTickBatch === 'function') {
      onTickBatch(chunkTicks, state.tick_index);
    }

    state.tick_index += chunkTicks;
    state.offline_backlog_ticks -= chunkTicks;
  }

  state.last_wallclock_unix_ts = nowUnixTs;
  return { processedTicks: ticks, chunks: chunks.length };
}
