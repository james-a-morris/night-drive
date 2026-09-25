import DOMPurify from "dompurify";
import type { AnkiClient } from "./anki-connect.ts";

export function localAnkiMedia(source: string): string | null {
  try {
    if (/^https?:/i.test(source)) {
      const url = new URL(source);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return null;
      source = url.pathname.slice(1);
    } else if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(source)) return null;
    const filename = decodeURIComponent(source.replace(/^\.\//, ""));
    return filename && filename.length <= 512 && filename !== ".." && !/[/\\\x00-\x1f]/.test(filename) ? filename : null;
  } catch { return null; }
}
const mimeTypes: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
};

// Card markup never enters the application DOM. A sandbox and CSP also prevent
// card scripts, links and styles from reaching AnkiConnect or the network.
export async function prepareAnkiCard(html: string, css: string, client: AnkiClient, signal: AbortSignal) {
  const body = DOMPurify.sanitize(html, {
    RETURN_DOM: true, ADD_TAGS: ["style"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "link", "meta", "base"],
    FORBID_ATTR: ["href", "xlink:href", "srcset", "action", "formaction", "autoplay", "contenteditable"],
  });
  if (!(body instanceof HTMLElement)) throw new Error("Couldn’t display this card safely.");
  const media = new Map<string, string>();
  const references = new Set<string>();
  const remember = (source: string) => { const name = localAnkiMedia(source); if (name) references.add(name); return name; };
  // Sound markers are text, never concatenated into HTML or attributes.
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    if (text.parentElement?.closest("style")) continue;
    const pattern = /\[sound:([^\]]+)\]/g;
    if (!pattern.test(text.data)) continue;
    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.data.matchAll(pattern)) {
      fragment.append(document.createTextNode(text.data.slice(last, match.index)));
      const audio = document.createElement("audio");
      audio.controls = true; audio.preload = "none";
      audio.setAttribute("src", match[1]);
      fragment.append(audio);
      last = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.data.slice(last)));
    text.replaceWith(fragment);
  }
  for (const element of body.querySelectorAll("[src],[poster]")) {
    for (const attribute of ["src", "poster"]) {
      const source = element.getAttribute(attribute);
      if (source) remember(source);
    }
  }
  const styles = [css, ...Array.from(body.querySelectorAll("style"), element => element.textContent || ""),
    ...Array.from(body.querySelectorAll("[style]"), element => element.getAttribute("style") || "")];
  const cssUrl = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
  for (const style of styles) for (const match of style.matchAll(cssUrl)) remember(match[2]);
  let bytes = 0, missing = references.size > 32;
  const dispose = () => media.clear();
  try {
    const queue = [...references].slice(0, 32);
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        signal.throwIfAborted();
        const filename = queue.shift()!;
        const type = mimeTypes[filename.split(".").pop()!.toLowerCase()];
        if (!type) { missing = true; continue; }
        let base64: string | null = null;
        try { base64 = await client.media(filename, signal); }
        catch { signal.throwIfAborted(); }
        if (!base64 || bytes + base64.length > 24_000_000) { missing = true; continue; }
        bytes += base64.length;
        // An opaque sandbox cannot access blob URLs owned by the parent origin.
        // Keep media self-contained and retain the sandbox's origin isolation.
        try { atob(base64); } catch { missing = true; continue; }
        media.set(filename, `data:${type};base64,${base64}`);
      }
    }));
    signal.throwIfAborted();
    for (const element of body.querySelectorAll("[src],[poster]")) {
      for (const attribute of ["src", "poster"]) {
        const source = element.getAttribute(attribute);
        if (!source) continue;
        const name = localAnkiMedia(source), url = name ? media.get(name) : null;
        if (url) element.setAttribute(attribute, url);
        else if (!/^data:(image|audio|video)\//i.test(source)) {
          element.removeAttribute(attribute); missing = true;
          if (element.tagName === "IMG" && !element.getAttribute("alt")) element.setAttribute("alt", "Image unavailable");
        }
      }
    }
    const safeCss = (value: string) => value.replace(/<\/style/gi, "/* /style */").replace(cssUrl, (_, quote, source: string) => {
      const name = localAnkiMedia(source), url = name ? media.get(name) : null;
      return url ? `url("${url}")` : "none";
    }).replace(/@import[^;]*(;|$)/gi, "");
    for (const element of body.querySelectorAll("style")) element.textContent = safeCss(element.textContent || "");
    for (const element of body.querySelectorAll("[style]")) element.setAttribute("style", safeCss(element.getAttribute("style") || ""));
    const token = crypto.randomUUID();
    const csp = `default-src 'none'; script-src 'nonce-${token}'; connect-src 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`;
    // Only this fixed, nonced relay can run. Card-authored scripts/handlers are
    // removed above and blocked by CSP. No same-origin sandbox permission.
    const relay = `document.addEventListener('keydown',event=>{
      if(event.target.closest('input,textarea,select,button,a,audio,video,[contenteditable]'))return;
      const key={};for(const name of ['key','code','shiftKey','ctrlKey','metaKey','altKey','repeat','isComposing'])key[name]=event[name];
      if(!event.isComposing&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&([' ','Enter','1','2','3','4','@','*'].includes(event.key)||(event.shiftKey&&['Digit2','Digit8'].includes(event.code)))){
        event.preventDefault();parent.postMessage({type:'night-rail-anki-key',token:${JSON.stringify(token)},key},${JSON.stringify(window.location.origin)});
      }
    });`;
    return {
      missing, dispose, token,
      srcDoc: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>
        html { color-scheme:dark; } body { margin:0; padding:28px; font:24px/1.65 system-ui,sans-serif; text-align:center; overflow-wrap:anywhere; }
        img,video,svg { max-width:100%; height:auto; } audio { max-width:100%; display:block; margin:16px auto; } pre { white-space:pre-wrap; } table { max-width:100%; } hr { border:0; border-top:1px solid #b9c8a933; margin:24px 0; } .cloze { color:#a8d3df; font-weight:600; }
        ${safeCss(css)}
        body.card { background:transparent!important; color:#ece6d3!important; } * { box-sizing:border-box; } @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; } }
      </style></head><body class="card nightMode night_mode">${body.innerHTML}<script nonce="${token}">${relay}</script></body></html>`,
    };
  } catch (error) { dispose(); throw error; }
}
