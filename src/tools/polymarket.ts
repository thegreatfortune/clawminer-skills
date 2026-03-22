import axios from 'axios'
import { parseAbi } from "viem"
import { getPublicClient } from "./wallet.js"

const GAMMA_BASE = 'https://gamma-api.polymarket.com'
const CORE_ADDRESS = "0x26dC6463d492E39D02441cE942c03a4d72D958bE" as const
const CORE_ABI = parseAbi([
  "function negRiskAdapter() view returns (address)",
])
const NEGRISK_ADAPTER_ABI = parseAbi([
  "function getQuestionCount(bytes32 marketId) view returns (uint256)",
  "function getConditionId(bytes32 questionId) view returns (bytes32)",
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Polymarket stores outcomes/outcomePrices as JSON strings. Parse them safely. */
function parseJsonStr<T>(val: unknown): T | null {
  if (val === null || val === undefined) return null
  if (typeof val !== 'string') return val as T
  try { return JSON.parse(val) as T } catch { return null }
}

/** Convert ISO date string to Unix timestamp. Returns null if invalid. */
function toUnixTs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return isNaN(ms) ? null : Math.floor(ms / 1000)
}

function extractNegRiskMarketId(e: any): string | null {
  const candidates = [
    e?.negRiskMarketId,
    e?.negRiskMarketID,
    e?.neg_risk_market_id,
    e?.markets?.[0]?.negRiskMarketId,
    e?.markets?.[0]?.negRiskMarketID,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("0x") && c.length === 66) {
      return c.toLowerCase()
    }
  }

  // Fallback: derive marketId from questionId by zeroing the low 8 bits.
  const questionId =
    e?.markets?.[0]?.questionID ??
    e?.markets?.[0]?.questionId ??
    e?.markets?.[0]?.question_id
  if (
    typeof questionId === "string" &&
    questionId.startsWith("0x") &&
    questionId.length === 66
  ) {
    try {
      const mask = ((1n << 256n) - 1n) ^ 0xffn
      const market = BigInt(questionId) & mask
      return "0x" + market.toString(16).padStart(64, "0")
    } catch {
      // ignore
    }
  }
  return null
}

function addToBytes32(value: `0x${string}`, offset: bigint): `0x${string}` {
  const v = BigInt(value) + offset
  return (`0x${v.toString(16).padStart(64, "0")}`) as `0x${string}`
}

async function deriveNegRiskConditionIds(
  marketId: `0x${string}`,
): Promise<string[]> {
  const client = getPublicClient()
  const adapter = (await client.readContract({
    address: CORE_ADDRESS,
    abi: CORE_ABI,
    functionName: "negRiskAdapter",
  })) as `0x${string}`

  const qCount = (await client.readContract({
    address: adapter,
    abi: NEGRISK_ADAPTER_ABI,
    functionName: "getQuestionCount",
    args: [marketId],
  })) as bigint

  const ids: string[] = []
  for (let i = 0n; i < qCount; i++) {
    const questionId = addToBytes32(marketId, i)
    const conditionId = (await client.readContract({
      address: adapter,
      abi: NEGRISK_ADAPTER_ABI,
      functionName: "getConditionId",
      args: [questionId],
    })) as `0x${string}`
    ids.push(conditionId.toLowerCase())
  }
  return ids
}

/**
 * Normalises a raw Polymarket market object into the fields
 * the ClawMiner agent needs for analysis and execution.
 */
function formatMarket(m: any) {
  const outcomes = parseJsonStr<string[]>(m.outcomes) ?? []
  const rawPrices = parseJsonStr<string[]>(m.outcomePrices) ?? []
  const prices = rawPrices.map(Number)

  // YES price = market implied probability for the first outcome
  const marketImpliedProb = prices.length > 0 ? prices[0] : null

  const clobTokenIds = parseJsonStr<string[]>(m.clobTokenIds) ?? []
  const expiresAt = toUnixTs(m.endDate)

  return {
    conditionId: m.conditionId ?? null,
    question: m.question ?? null,
    description: m.description ?? null,
    resolutionSource: m.resolutionSource ?? null,
    outcomes,
    outcomePrices: prices,
    marketImpliedProb,          // market-implied YES probability (for alpha calculation)
    liquidityUsd: m.liquidityNum ?? m.liquidityClob ?? parseFloat(m.liquidity) ?? 0,
    volumeUsd: m.volumeNum ?? m.volumeClob ?? parseFloat(m.volume) ?? 0,
    volume24hrUsd: m.volume24hr ?? m.volume24hrClob ?? 0,
    endDate: m.endDate ?? null,
    expiresAt,                  // Unix timestamp — used as save_prediction_record.expiresAt
    spread: m.spread ?? null,
    bestBid: m.bestBid ?? null,
    bestAsk: m.bestAsk ?? null,
    lastTradePrice: m.lastTradePrice ?? null,
    acceptingOrders: m.acceptingOrders ?? false,
    restricted: m.restricted ?? false,
    clobTokenIds,
    events: Array.isArray(m.events)
      ? m.events.map((e: any) => ({
          id: e?.id ?? null,
          slug: e?.slug ?? null,
          title: e?.title ?? null,
          endDate: e?.endDate ?? null,
          closed: e?.closed ?? null,
        }))
      : [],
  }
}

/** Summary view of an event used in search / scan results. */
function formatEventSummary(e: any) {
  const markets = (e.markets ?? []).map(formatMarket)
  const negRiskMarketId = extractNegRiskMarketId(e)
  return {
    eventId: e.id,
    title: e.title,
    slug: e.slug,
    endDate: e.endDate,
    expiresAt: toUnixTs(e.endDate),
    liquidityUsd: e.liquidity ?? 0,
    volumeUsd: e.volume ?? 0,
    volume24hrUsd: e.volume24hr ?? 0,
    restricted: e.restricted ?? false,
    negRisk: e.negRisk ?? e.neg_risk ?? Boolean(negRiskMarketId),
    negRiskMarketId,
    tags: (e.tags ?? []).map((t: any) => t.label),
    markets,
  }
}

/** Full event view including description and resolution source. */
function formatEventFull(e: any) {
  const markets = (e.markets ?? []).map(formatMarket)
  const negRiskMarketId = extractNegRiskMarketId(e)
  return {
    eventId: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description ?? null,
    resolutionSource: e.resolutionSource ?? null,
    endDate: e.endDate ?? null,
    expiresAt: toUnixTs(e.endDate),
    liquidityUsd: e.liquidity ?? 0,
    volumeUsd: e.volume ?? 0,
    volume24hrUsd: e.volume24hr ?? 0,
    openInterest: e.openInterest ?? 0,
    competitive: e.competitive ?? null,
    active: e.active ?? false,
    closed: e.closed ?? false,
    restricted: e.restricted ?? false,
    negRisk: e.negRisk ?? e.neg_risk ?? Boolean(negRiskMarketId),
    negRiskMarketId,
    tags: (e.tags ?? []).map((t: any) => ({ id: t.id, label: t.label })),
    markets,
  }
}

// ─── Tool: search_events ──────────────────────────────────────────────────────

/**
 * Searches Polymarket for active events matching a keyword.
 * Returns the top N results ordered by 24h volume, with all fields
 * required by clawminer_explore to rank candidates and by
 * clawminer_analyze to run the 5-stage SOP.
 */
export async function searchEvents(
  keyword: string,
  limit = 10,
  minLiquidityUsd = 0
): Promise<string> {
  try {
    const params: Record<string, any> = {
      query: keyword,
      active: true,
      closed: false,
      order: 'volume_24hr',
      ascending: false,
      limit: Math.min(limit, 50),
    }

    const { data } = await axios.get<any[]>(`${GAMMA_BASE}/events`, { params })

    if (!Array.isArray(data)) {
      return JSON.stringify({ events: [] })
    }

    const events = data
      .map(formatEventSummary)
      .filter(e => e.liquidityUsd >= minLiquidityUsd)

    return JSON.stringify({ count: events.length, events })
  } catch (err: any) {
    return JSON.stringify({ error: `searchEvents failed: ${err.message}` })
  }
}

// ─── Tool: get_event_details ──────────────────────────────────────────────────

/**
 * Fetches full details for a single Polymarket event by ID or slug.
 * Returns everything clawminer_analyze needs:
 *   - resolution rules (description, resolutionSource)
 *   - all markets with conditionId, outcomePrices, liquidity
 *   - expiresAt Unix timestamp (for save_prediction_record)
 */
export async function getEventDetails(eventIdOrSlug: string): Promise<string> {
  try {
    // Try numeric ID first, fall back to slug query
    const isNumeric = /^\d+$/.test(eventIdOrSlug)
    const url = isNumeric
      ? `${GAMMA_BASE}/events/${eventIdOrSlug}`
      : `${GAMMA_BASE}/events`

    const params = isNumeric ? {} : { slug: eventIdOrSlug }
    const { data } = await axios.get(url, { params })

    // /events?slug= returns an array
    const event = Array.isArray(data) ? data[0] : data

    if (!event) {
      return JSON.stringify({ error: `Event not found: ${eventIdOrSlug}` })
    }

    return JSON.stringify(formatEventFull(event))
  } catch (err: any) {
    return JSON.stringify({ error: `getEventDetails failed: ${err.message}` })
  }
}

// ─── Tool: get_top_events ─────────────────────────────────────────────────────

/**
 * Fetches the top active Polymarket events ranked by the given metric.
 * Used by clawminer_explore when scanning the market without a specific
 * keyword — e.g., "give me the highest-volume macro events right now".
 *
 * @param limit           Max events to return (1–50, default 20)
 * @param order           Ranking metric: 'volume_24hr' | 'volume' | 'liquidity' | 'competitive'
 * @param tagId           Optional Polymarket tag ID to filter by topic (use get_tags to discover IDs)
 * @param minLiquidityUsd Minimum event liquidity in USD (profile risk filter)
 */
export async function getTopEvents(
  limit = 20,
  order = 'volume_24hr',
  tagId?: number,
  minLiquidityUsd = 0
): Promise<string> {
  try {
    const params: Record<string, any> = {
      active: true,
      closed: false,
      order,
      ascending: false,
      limit: Math.min(limit, 50),
    }
    if (tagId) params.tag_id = tagId

    const { data } = await axios.get<any[]>(`${GAMMA_BASE}/events`, { params })

    if (!Array.isArray(data)) {
      return JSON.stringify({ events: [] })
    }

    const events = data
      .map(formatEventSummary)
      .filter(e => e.liquidityUsd >= minLiquidityUsd)

    return JSON.stringify({ count: events.length, order, events })
  } catch (err: any) {
    return JSON.stringify({ error: `getTopEvents failed: ${err.message}` })
  }
}

// ─── Tool: get_tags ───────────────────────────────────────────────────────────

/**
 * Returns the full list of Polymarket topic tags with their IDs.
 * Use this to map Mining Profile topics (e.g. "crypto", "politics")
 * to tag IDs for use with get_top_events.
 */
export async function getTags(): Promise<string> {
  try {
    const { data } = await axios.get<any[]>(`${GAMMA_BASE}/tags`)

    if (!Array.isArray(data)) {
      return JSON.stringify({ tags: [] })
    }

    const tags = data.map((t: any) => ({
      id: t.id,
      label: t.label,
      slug: t.slug ?? null,
    }))

    return JSON.stringify({ count: tags.length, tags })
  } catch (err: any) {
    return JSON.stringify({ error: `getTags failed: ${err.message}` })
  }
}

// ─── Tool: check_event_resolution ─────────────────────────────────────────────

/**
 * Checks whether a Polymarket event has resolved (closed = true).
 * Used by clawminer_claim to determine if an event is ready for settlement.
 * Accepts numeric eventId or event slug.
 * Returns the event's closed status, closedTime, and all market resolution data.
 */
export async function checkEventResolution(eventIdOrSlug: string): Promise<string> {
  try {
    const input = String(eventIdOrSlug).trim()
    let data: any = null

    // Prefer slug lookup first (works for both human-readable slugs and many id-like strings).
    const bySlug = await axios.get<any[]>(`${GAMMA_BASE}/events`, {
      params: { slug: input, limit: 1 },
    })
    if (Array.isArray(bySlug.data) && bySlug.data.length > 0) {
      data = bySlug.data[0]
    } else if (/^\d+$/.test(input)) {
      // Fallback for canonical numeric event id.
      const byId = await axios.get(`${GAMMA_BASE}/events/${input}`)
      data = byId.data
    }

    if (!data) {
      return JSON.stringify({ error: `Event not found: ${input}` })
    }

    const markets = (data.markets ?? []).map((m: any) => ({
      conditionId: m.conditionId ?? null,
      question: m.question ?? null,
      closed: m.closed ?? false,
      closedTime: m.closedTime ?? null,
      outcomes: parseJsonStr<string[]>(m.outcomes) ?? [],
      outcomePrices: (parseJsonStr<string[]>(m.outcomePrices) ?? []).map(Number),
      umaResolutionStatus: m.umaResolutionStatus ?? null,
    }))

    return JSON.stringify({
      eventId: data.id,
      title: data.title,
      closed: data.closed ?? false,
      closedTime: data.closedTime ?? null,
      active: data.active ?? false,
      markets,
    })
  } catch (err: any) {
    return JSON.stringify({ error: `checkEventResolution failed: ${err.message}` })
  }
}

// ─── Tool: get_market_by_condition_id ─────────────────────────────────────────

/**
 * Fetches a specific market by its conditionId.
 * Used when you have a conditionId from a prediction record and need to
 * verify current prices or resolution status before claiming.
 */
export async function getMarketByConditionId(conditionId: string): Promise<string> {
  try {
    const normalized = String(conditionId).toLowerCase().trim()
    const { data } = await axios.get<any[]>(`${GAMMA_BASE}/markets`, {
      params: { condition_ids: normalized, limit: 1 },
    })
    const market = Array.isArray(data) ? data[0] : null

    if (!market) {
      return JSON.stringify({ error: `Market not found: ${conditionId}` })
    }

    return JSON.stringify(formatMarket(market))
  } catch (err: any) {
    return JSON.stringify({ error: `getMarketByConditionId failed: ${err.message}` })
  }
}

// ─── Tool: public_search ──────────────────────────────────────────────────────

/**
 * Unified search across events, markets, and profiles using Polymarket's
 * /public-search endpoint. Returns all matching entities.
 * Useful for exploratory queries when you don't know if the user is asking
 * about an event, a market, or a topic.
 */
export async function publicSearch(query: string, limit = 10): Promise<string> {
  try {
    const params = { query, limit: Math.min(limit, 50) }
    const { data } = await axios.get(`${GAMMA_BASE}/public-search`, { params })

    if (!data) {
      return JSON.stringify({ events: [], markets: [], tags: [], profiles: [] })
    }

    const events = (data.events ?? []).map(formatEventSummary)
    const markets = (data.markets ?? []).map(formatMarket)
    const tags = (data.tags ?? []).map((t: any) => ({ id: t.id, label: t.label, slug: t.slug }))
    const profiles = (data.profiles ?? []).map((p: any) => ({
      id: p.id,
      name: p.name ?? p.pseudonym ?? null,
      pseudonym: p.pseudonym ?? null,
    }))

    return JSON.stringify({
      query,
      events: { count: events.length, items: events },
      markets: { count: markets.length, items: markets },
      tags: { count: tags.length, items: tags },
      profiles: { count: profiles.length, items: profiles },
    })
  } catch (err: any) {
    return JSON.stringify({ error: `publicSearch failed: ${err.message}` })
  }
}

// ─── Tool: resolve_task_target ───────────────────────────────────────────────

/**
 * Resolves a ClawMiner task target into concrete Polymarket event + market metadata.
 *
 * - Non-NegRisk: targetId is conditionId
 * - NegRisk: targetId is negRiskMarketId
 */
export async function resolveTaskTarget(
  targetId: string,
  isNegRisk: boolean,
): Promise<string> {
  try {
    const normalizedTarget = targetId.toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(normalizedTarget)) {
      return JSON.stringify({
        error: `resolveTaskTarget failed: targetId must be bytes32 (0x + 64 hex), got ${targetId}`,
      });
    }

    // Path A: Non-NegRisk — targetId is exactly conditionId.
    if (!isNegRisk) {
      const marketRaw = await getMarketByConditionId(normalizedTarget);
      const marketParsed = JSON.parse(marketRaw);
      if (marketParsed?.error) return marketRaw;

      // Best-effort event lookup by conditionId.
      // Prefer market-attached events from /markets response (most stable mapping),
      // then fallback to /events?condition_ids.
      let event: any | null = null;
      const marketEvent = Array.isArray((marketParsed as any)?.events)
        ? (marketParsed as any).events[0]
        : null;
      if (marketEvent) {
        event = marketEvent;
      }
      try {
        if (!event) {
          const { data } = await axios.get<any[]>(`${GAMMA_BASE}/events`, {
            params: { condition_ids: normalizedTarget, limit: 20 },
          });
          if (Array.isArray(data) && data.length > 0) {
            const matched = data.find((e: any) =>
              Array.isArray(e?.markets) &&
              e.markets.some(
                (m: any) =>
                  String(m?.conditionId ?? "").toLowerCase() === normalizedTarget,
              ),
            );
            event = matched ?? data[0];
          }
        }
      } catch {
        // Non-fatal: market payload already gives enough to continue.
      }

      return JSON.stringify({
        targetId: normalizedTarget,
        isNegRisk: false,
        eventId: event?.id ?? null,
        slug: event?.slug ?? null,
        title: event?.title ?? marketParsed.question ?? null,
        eventEndTime: toUnixTs(event?.endDate ?? marketParsed.endDate),
        selectedConditionId: marketParsed.conditionId ?? normalizedTarget,
        markets: [
          {
            questionIndex: 0,
            conditionId: marketParsed.conditionId ?? normalizedTarget,
            question: marketParsed.question ?? null,
            outcomePrices: marketParsed.outcomePrices ?? [],
            liquidityUsd: marketParsed.liquidityUsd ?? 0,
            volumeUsd: marketParsed.volumeUsd ?? 0,
            endDate: marketParsed.endDate ?? null,
            expiresAt: marketParsed.expiresAt ?? null,
            closed: event?.closed ?? null,
          },
        ],
      });
    }

    // Path B: NegRisk — targetId is negRiskMarketId.
    let derivedConditionIds: string[] = [];
    try {
      derivedConditionIds = await deriveNegRiskConditionIds(
        normalizedTarget as `0x${string}`,
      );
      if (derivedConditionIds.length === 0) {
        return JSON.stringify({
          error: `resolveTaskTarget failed: invalid negRiskMarketId (questionCount=0) ${normalizedTarget}`,
        });
      }
    } catch {
      // keep compatibility: continue API path even if chain lookup fails
    }

    // Gamma uses both spellings in the wild; we try both.
    const queries = [
      { negRiskMarketID: normalizedTarget, limit: 20 },
      { negRiskMarketId: normalizedTarget, limit: 20 },
    ];

    let event: any | null = null;
    const fallbackMarkets: any[] = [];
    for (const params of queries) {
      try {
        const { data } = await axios.get<any[]>(`${GAMMA_BASE}/events`, {
          params,
        });
        if (Array.isArray(data) && data.length > 0) {
          const exact = data.find(
            (e: any) =>
              String(extractNegRiskMarketId(e) ?? "").toLowerCase() ===
              normalizedTarget,
          );
          if (exact) {
            event = exact;
            break;
          }
        }
      } catch {
        // try next shape
      }
    }

    // Fallback: derive all conditionIds on-chain, then map conditionId -> market -> event.
    if (!event) {
      try {
        for (const conditionId of derivedConditionIds) {
          const raw = await getMarketByConditionId(conditionId);
          const market = JSON.parse(raw);
          if (market?.error) continue;
          fallbackMarkets.push(market);
          const attached = Array.isArray(market?.events) ? market.events : [];
          const exactEvent = attached.find(
            (e: any) =>
              String(extractNegRiskMarketId(e) ?? "").toLowerCase() ===
              normalizedTarget,
          );
          if (exactEvent) {
            event = exactEvent;
            break;
          }
        }
      } catch {
        // ignore fallback failures and return unified error below
      }
    }

    if (!event) {
      return JSON.stringify({
        error: `resolveTaskTarget failed: no event found for negRiskMarketId ${normalizedTarget}`,
      });
    }

    const rawMarkets = fallbackMarkets.length > 0
      ? fallbackMarkets
      : Array.isArray(event.markets)
        ? event.markets
        : [];
    const markets = rawMarkets.map((m: any, idx: number) => {
      const fm = formatMarket(m);
      return {
        questionIndex: idx,
        conditionId: fm.conditionId,
        question: fm.question,
        outcomePrices: fm.outcomePrices,
        liquidityUsd: fm.liquidityUsd,
        volumeUsd: fm.volumeUsd,
        endDate: fm.endDate,
        expiresAt: fm.expiresAt,
        closed: m?.closed ?? null,
      };
    });

    return JSON.stringify({
      targetId: normalizedTarget,
      isNegRisk: true,
      eventId: event.id ?? null,
      slug: event.slug ?? null,
      title: event.title ?? null,
      eventEndTime: toUnixTs(event.endDate),
      questionCount: markets.length,
      markets,
    });
  } catch (err: any) {
    return JSON.stringify({ error: `resolveTaskTarget failed: ${err.message}` });
  }
}
