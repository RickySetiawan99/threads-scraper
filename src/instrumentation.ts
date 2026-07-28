export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing Worker Daemon in background...');
    await import('./worker');
  }
}
