export class ResponseTooLarge extends Error {
  constructor() {
    super("Response is too large.");
    this.name = "ResponseTooLarge";
  }
}

// response.json() has no size limit. Bound both declared and streamed bodies so
// an unavailable or compromised upstream cannot make the browser/server retain
// an arbitrarily large response before parsing it.
export async function readBoundedJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const declared = response.headers?.get?.("content-length");
  if (declared !== null && declared !== undefined) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes)
      throw new ResponseTooLarge();
  }

  const body = response.body;
  // A few test doubles and older fetch implementations expose only json().
  if (!body?.getReader) return response.json();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ResponseTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
