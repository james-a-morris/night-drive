export interface Station {
  id: string;
  title: string;
  url: string;
  subtitle: string;
}
type CanPlayType = (type: string) => string | boolean;
const DISCOVERY = "https://all.api.radio-browser.info";
const BOOTSTRAP = "https://de1.api.radio-browser.info";
const SEARCH =
  "/json/stations/search?limit=10&tagList=lofi&hidebroken=true&order=clickcount&reverse=true";
const MIME_TYPES: Record<string, string[]> = {
  MP3: ["audio/mpeg"],
  AAC: ["audio/aac", 'audio/mp4; codecs="mp4a.40.2"'],
  "AAC+": ["audio/aac", 'audio/mp4; codecs="mp4a.40.5"'],
  OGG: ['audio/ogg; codecs="vorbis"', 'audio/ogg; codecs="opus"'],
  OPUS: ['audio/ogg; codecs="opus"'],
  FLAC: ["audio/flac"],
};

export function playableStations(
  rows: unknown[],
  canPlayType: CanPlayType,
): Station[] {
  const seen = new Set();
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    if (!row || Number(row.lastcheckok) !== 1 || Number(row.hls) === 1)
      return [];
    if (
      !String(row.tags)
        .toLowerCase()
        .split(",")
        .some((tag) => tag.trim() === "lofi")
    )
      return [];
    if (
      !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(
        String(row.stationuuid),
      )
    )
      return [];
    const types = MIME_TYPES[String(row.codec).toUpperCase()];
    if (!types?.some((type) => canPlayType(type))) return [];
    let url;
    try {
      url = new URL(String(row.url_resolved || row.url));
    } catch {
      return [];
    }
    // Some working stations (including Lofi 24/7) advertise HTTP URLs even
    // though they support TLS. Try HTTPS without losing their directory rank.
    if (url.protocol === "http:") url.protocol = "https:";
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      /\.(m3u8?|pls|asx)$/i.test(url.pathname)
    )
      return [];
    if (seen.has(url.href) || seen.has(row.stationuuid)) return [];
    seen.add(url.href);
    seen.add(row.stationuuid);
    return [
      {
        id: String(row.stationuuid),
        title: String(row.name || "Lo-fi radio").trim(),
        url: url.href,
        subtitle:
          [row.country, Number(row.bitrate) > 0 ? `${row.bitrate} kbps` : null]
            .filter(Boolean)
            .join(" · ") || "Lo-fi radio",
      },
    ];
  });
}

export class RadioDirectory {
  fetcher: typeof fetch;
  server: string | null;
  constructor(fetcher = globalThis.fetch.bind(globalThis)) {
    this.fetcher = fetcher;
    this.server = null;
  }

  async json(url: string): Promise<unknown> {
    const response = await this.fetcher(url, {
      signal: AbortSignal.timeout(5000),
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Radio directory unavailable");
    return response.json();
  }

  async load(canPlayType: CanPlayType): Promise<Station[]> {
    let mirrors: string[] = [];
    try {
      const servers = await this.json(`${DISCOVERY}/json/servers`);
      if (Array.isArray(servers))
        mirrors = [
          ...new Set(
            servers.flatMap((server: unknown) => {
              const name =
                server && typeof server === "object" && "name" in server
                  ? server.name
                  : null;
              return typeof name === "string" &&
                /^[a-z\d-]+\.api\.radio-browser\.info$/i.test(name)
                ? [`https://${name}`]
                : [];
            }),
          ),
        ];
      // Follow Radio Browser's discovery guidance and distribute requests.
      for (let i = mirrors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mirrors[i], mirrors[j]] = [mirrors[j], mirrors[i]];
      }
    } catch {
      /* The bootstrap mirror can still work when discovery is down. */
    }
    const candidates = [
      ...new Set(
        [this.server, ...mirrors, BOOTSTRAP, DISCOVERY].filter(
          (server): server is string => Boolean(server),
        ),
      ),
    ];
    for (const server of candidates.slice(0, 3)) {
      try {
        const rows = await this.json(`${server}${SEARCH}`);
        if (!Array.isArray(rows)) continue;
        const stations = playableStations(rows, canPlayType);
        if (!stations.length) continue;
        this.server = server;
        return stations;
      } catch {
        /* Try another mirror before using the local music. */
      }
    }
    throw new Error("No playable lo-fi stations are available");
  }

  recordClick(id: string) {
    if (!this.server) return;
    // Count an actual listen, not a directory lookup or a failed connection.
    void this.json(`${this.server}/json/url/${encodeURIComponent(id)}`).catch(
      () => {},
    );
  }
}
