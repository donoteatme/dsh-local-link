const CLIENT_ID = 'dsh-local-link'
const HOST_ONLY_CLIENT_IDS = new Set([
  '@deepseek-ai/dsh-client-ui-directory-picker-native',
  '@deepseek-ai/dsh-client-ui-directory-picker-browse',
  '@deepseek-ai/dsh-client-ui-open-in-app',
])
const RANDOM_UUID_POLYFILL = `if(!window.crypto.randomUUID){window.crypto.randomUUID=function(){const b=new Uint8Array(16);window.crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,value=>value.toString(16).padStart(2,'0'));return h.slice(0,4).join('')+'-'+h.slice(4,6).join('')+'-'+h.slice(6,8).join('')+'-'+h.slice(8,10).join('')+'-'+h.slice(10).join('')}};`

interface BootEntry { id?: unknown }

interface BootBatch {
  entries?: unknown
}

interface BootManifest {
  rev?: unknown
  entries?: unknown
  batches?: unknown
}

function ensureResponsiveViewport(html: string): string {
  const viewport = /<meta\b(?=[^>]*\bname\s*=\s*["']viewport["'])[^>]*>/iu
  const match = viewport.exec(html)
  if (match === null) {
    const head = /<head\b[^>]*>/iu.exec(html)
    if (head?.index === undefined) return html
    const offset = head.index + head[0].length
    return `${html.slice(0, offset)}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${html.slice(offset)}`
  }
  if (/\bviewport-fit\s*=\s*cover\b/iu.test(match[0])) return html
  const content = /\bcontent\s*=\s*(["'])(.*?)\1/iu
  const replacement = content.test(match[0])
    ? match[0].replace(content, (_whole, quote: string, value: string) => `content=${quote}${value},viewport-fit=cover${quote}`)
    : match[0].replace(/\s*\/?>$/u, ' content="width=device-width,initial-scale=1,viewport-fit=cover">')
  return `${html.slice(0, match.index)}${replacement}${html.slice(match.index + match[0].length)}`
}

function removeHostOnlyCapabilities(manifest: BootManifest, entries: BootEntry[]): void {
  const removed = new Set<string>()
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const id = String(entries[index]?.id)
    if (!HOST_ONLY_CLIENT_IDS.has(id)) continue
    removed.add(id)
    entries.splice(index, 1)
  }
  if (!Array.isArray(manifest.batches) || removed.size === 0) return
  for (const value of manifest.batches) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const batch = value as BootBatch
    if (Array.isArray(batch.entries)) {
      batch.entries = batch.entries.filter(id => !removed.has(String(id)))
    }
  }
}

/**
 * Keep the shipped Harness root and every dynamic child slot. The gateway only
 * removes Host-side directory picker and native app capabilities from remote browsers and
 * adds the secure-context polyfill required by the stock browser transport.
 */
export function rewriteAuthenticatedIndex(html: string): string {
  const assignment = /(?:window\.__DSH_BOOT__|globalThis\["__DSH_BOOT__"\])\s*=\s*/u.exec(html)
  if (assignment?.index === undefined) return html
  const valueStart = assignment.index + assignment[0].length
  const scriptEnd = html.indexOf('</script>', valueStart)
  if (scriptEnd < 0) throw new Error('DSH boot manifest script is incomplete')
  const source = html.slice(valueStart, scriptEnd).trim().replace(/;$/u, '')
  const manifest = JSON.parse(source) as BootManifest
  if (!Array.isArray(manifest.entries)) throw new Error('DSH boot manifest has no entries')
  const entries = manifest.entries as BootEntry[]
  if (!entries.some(entry => entry.id === CLIENT_ID)) throw new Error('dsh-local-link client is absent from DSH boot manifest')
  removeHostOnlyCapabilities(manifest, entries)

  // Plain HTTP on a private IP is not a secure context. getRandomValues is
  // still available, so the stock browser RPC client can use an RFC 4122 v4
  // randomUUID fallback without replacing its transport or root layout.
  const rewritten = `${html.slice(0, assignment.index)}${RANDOM_UUID_POLYFILL}${assignment[0]}${JSON.stringify(manifest)};${html.slice(scriptEnd)}`
  return ensureResponsiveViewport(rewritten)
}
