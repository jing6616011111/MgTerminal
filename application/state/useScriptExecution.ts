import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScriptRun, ScriptRunParams } from '@/types/global/magies-terminal-bridge-script.d.ts';
import { magiesTerminalBridge } from '@/infrastructure/services/magiesTerminalBridge.ts';

export function useScriptExecution() {
  const [runs, setRuns] = useState<ScriptRun[]>([]);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  useEffect(() => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.scriptGetRuns) return undefined;
    bridge.scriptGetRuns().then(setRuns).catch(() => {});
    const dispose = bridge.onScriptRunsUpdated?.(({ runs: nextRuns }) => {
      setRuns(nextRuns);
    });
    return dispose;
  }, []);

  const runScript = useCallback(async (params: ScriptRunParams) => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.scriptRun) {
      throw new Error('Script bridge unavailable');
    }
    return bridge.scriptRun(params);
  }, []);

  const stopRun = useCallback(async (runId: string) => {
    await magiesTerminalBridge.get()?.scriptStop?.(runId);
  }, []);

  const pauseRun = useCallback(async (runId: string) => {
    await magiesTerminalBridge.get()?.scriptPause?.(runId);
  }, []);

  const resumeRun = useCallback(async (runId: string) => {
    await magiesTerminalBridge.get()?.scriptResume?.(runId);
  }, []);

  const getRunsForSession = useCallback((sessionId: string) => {
    return runsRef.current.filter((run) => run.sessionId === sessionId);
  }, []);

  return {
    runs,
    runScript,
    stopRun,
    pauseRun,
    resumeRun,
    getRunsForSession,
  };
}
