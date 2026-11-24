const QUOTA_TIME_ZONE = 'America/Los_Angeles';

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const laDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: QUOTA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function getZonedDateTimeParts(
  timestampMs: number,
  formatter: Intl.DateTimeFormat
): ZonedDateTimeParts {
  const parts = formatter.formatToParts(new Date(timestampMs));
  const lookup = new Map<Intl.DateTimeFormatPartTypes, number>();
  for (const part of parts) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day' ||
      part.type === 'hour' ||
      part.type === 'minute' ||
      part.type === 'second'
    ) {
      lookup.set(part.type, Number(part.value));
    }
  }
  const rawHour = lookup.get('hour') ?? 0;
  return {
    year: lookup.get('year') ?? 1970,
    month: lookup.get('month') ?? 1,
    day: lookup.get('day') ?? 1,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: lookup.get('minute') ?? 0,
    second: lookup.get('second') ?? 0,
  };
}

/**
 * Finds the exact UTC epoch ms corresponding to 00:00:00.000 in America/Los_Angeles
 * for the given LA calendar date, handling PST/PDT daylight saving transitions
 * strictly via Intl.DateTimeFormat without hardcoded offsets.
 */
export function getLosAngelesMidnightUtcMs(
  year: number,
  month: number,
  day: number
): number {
  const targetUtcWallMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  // Start with an approximate UTC timestamp (8h offset) and converge via Intl.
  let candidateMs = targetUtcWallMs + 8 * 60 * 60 * 1000;

  for (let i = 0; i < 4; i++) {
    const observed = getZonedDateTimeParts(candidateMs, laDateTimeFormatter);
    const observedUtcWallMs = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
      0
    );
    const diffMs = targetUtcWallMs - observedUtcWallMs;
    if (diffMs === 0) {
      break;
    }
    candidateMs += diffMs;
  }

  return candidateMs;
}

export interface QuotaDayBounds {
  startMs: number;
  resetMs: number;
  laDateKey: string;
}

export function getQuotaDayBounds(nowMs: number = Date.now()): QuotaDayBounds {
  const laNow = getZonedDateTimeParts(nowMs, laDateTimeFormatter);
  const startMs = getLosAngelesMidnightUtcMs(laNow.year, laNow.month, laNow.day);

  const nextCalendarUtc = new Date(
    Date.UTC(laNow.year, laNow.month - 1, laNow.day + 1)
  );
  const resetMs = getLosAngelesMidnightUtcMs(
    nextCalendarUtc.getUTCFullYear(),
    nextCalendarUtc.getUTCMonth() + 1,
    nextCalendarUtc.getUTCDate()
  );

  const mm = String(laNow.month).padStart(2, '0');
  const dd = String(laNow.day).padStart(2, '0');

  return {
    startMs,
    resetMs,
    laDateKey: `${laNow.year}-${mm}-${dd}`,
  };
}

export function formatQuotaResetLocalTime(resetMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(resetMs));
}

export function formatQuotaResetLocalDateTime(resetMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(resetMs));
}

export function getNextQuotaResetInfo(nowMs: number = Date.now()): {
  resetMs: number;
  localTime: string;
  localDateTime: string;
} {
  const { resetMs } = getQuotaDayBounds(nowMs);
  return {
    resetMs,
    localTime: formatQuotaResetLocalTime(resetMs),
    localDateTime: formatQuotaResetLocalDateTime(resetMs),
  };
}
