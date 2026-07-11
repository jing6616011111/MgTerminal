export type MagiesTerminalRequestTooLargeRetryError = Error & {
  magiesTerminalHadToolProgress?: boolean;
  statusCode?: number;
  status?: number;
  responseBody?: string;
};

export function createMagiesTerminalRequestTooLargeRetryError(
  error: unknown,
  hadToolProgress: boolean,
): MagiesTerminalRequestTooLargeRetryError {
  const message = error instanceof Error
    ? error.message
    : String(error ?? 'Request too large');
  const retryError = new Error(message) as MagiesTerminalRequestTooLargeRetryError;
  retryError.name = 'MagiesTerminalRequestTooLargeRetryError';
  retryError.cause = error;
  retryError.magiesTerminalHadToolProgress = hadToolProgress;
  retryError.statusCode = 413;
  if (error && typeof error === 'object') {
    const source = error as Record<string, unknown>;
    if (typeof source.status === 'number') retryError.status = source.status;
    if (typeof source.responseBody === 'string') retryError.responseBody = source.responseBody;
  }
  return retryError;
}

export function hadToolProgressBeforeRequestTooLarge(error: unknown): boolean {
  return !!(
    error &&
    typeof error === 'object' &&
    (error as { magiesTerminalHadToolProgress?: boolean }).magiesTerminalHadToolProgress
  );
}
