/** i18n keys for compaction status — resolved in useAgentCompactionUi. */
export const MAGIES_TERMINAL_COMPACTION_STATUS_KEYS = {
  preTurn: 'ai.chat.compactingContext',
  step: 'ai.chat.compactingStep',
  retry: 'ai.chat.compactionRetry',
} as const;

export type MagiesTerminalCompactionStatusKey =
  typeof MAGIES_TERMINAL_COMPACTION_STATUS_KEYS[keyof typeof MAGIES_TERMINAL_COMPACTION_STATUS_KEYS];
