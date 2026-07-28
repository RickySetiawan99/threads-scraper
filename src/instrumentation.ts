export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      console.log('[Instrumentation] Initializing Worker Daemon in background...');
      await import('./worker');
    } catch (err: any) {
      console.error('[Instrumentation] Failed to load Worker Daemon:', err?.message || err);
    }
  }
}
