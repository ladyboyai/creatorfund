// Plain JSON-RPC helpers. No browser APIs, so they are also tested in Node.

export const YOCTO = 10n ** 24n;

/** "1.5" NEAR -> yocto string. Throws on bad input. */
export function parseNear(input: string): string {
  const s = input.trim();
  if (!/^\d+(\.\d{1,24})?$/.test(s)) throw new Error('Enter a NEAR amount like 1.5');
  const [whole, frac = ''] = s.split('.');
  return (BigInt(whole) * YOCTO + BigInt(frac.padEnd(24, '0'))).toString();
}

/** yocto string -> "1.5" (trims zeros, max 4 decimals shown). */
export function formatNear(yocto: string | bigint, maxDecimals = 4): string {
  const v = BigInt(yocto);
  const whole = v / YOCTO;
  const frac = (v % YOCTO).toString().padStart(24, '0').slice(0, maxDecimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

export async function viewCall<T>(rpcUrl: string, contractId: string, method: string, args: object = {}): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'ladyboyai',
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'optimistic',
        account_id: contractId,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.data || body.error.message || 'RPC error');
  if (body.result?.error) throw new Error(body.result.error);
  const bytes: number[] = body.result.result;
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
}
