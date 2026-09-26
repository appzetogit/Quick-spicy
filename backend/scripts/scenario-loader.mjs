// Used only by scenario-payments.mjs. Notification services import server.js to reach
// Socket.IO, and importing it boots the whole server - HTTP listener, Redis adapter and a
// Firebase "schema repair" against whatever database is connected. A test must never do
// any of that, so server.js resolves to a stub with no live connections.
const SERVER_URL = new URL('../server.js', import.meta.url).href;

export async function resolve(specifier, context, next) {
  const resolved = await next(specifier, context);
  if (resolved.url === SERVER_URL) {
    return { url: 'data:text/javascript,export const getIO = () => null; export default {};', shortCircuit: true };
  }
  return resolved;
}
