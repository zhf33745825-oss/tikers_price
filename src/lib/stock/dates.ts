import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import {
  DEFAULT_LOOKBACK_YEARS,
  SHANGHAI_TIME_ZONE,
} from "@/lib/stock/constants";
import { InputError } from "@/lib/stock/errors";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const DATE_FORMAT = "YYYY-MM-DD";

export interface DateRange {
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
}

function parseDateStringOrThrow(dateString: string, fieldName: string): dayjs.Dayjs {
  const parsed = dayjs(dateString, DATE_FORMAT, true).tz(SHANGHAI_TIME_ZONE);
  if (!parsed.isValid()) {
    throw new InputError(`${fieldName} must be in YYYY-MM-DD format`);
  }
  return parsed;
}

export function buildDateRange(
  fromRaw?: string | null,
  toRaw?: string | null,
): DateRange {
  const defaultTo = dayjs().tz(SHANGHAI_TIME_ZONE).startOf("day");
  const defaultFrom = defaultTo.subtract(DEFAULT_LOOKBACK_YEARS, "year");

  const fromDay = fromRaw
    ? parseDateStringOrThrow(fromRaw, "from")
    : defaultFrom;
  const toDay = toRaw ? parseDateStringOrThrow(toRaw, "to") : defaultTo;

  if (fromDay.isAfter(toDay)) {
    throw new InputError("from cannot be later than to");
  }

  if (toDay.diff(fromDay, "year", true) > 20) {
    throw new InputError("date range cannot exceed 20 years");
  }

  return {
    from: fromDay.format(DATE_FORMAT),
    to: toDay.format(DATE_FORMAT),
    fromDate: fromDay.startOf("day").toDate(),
    toDate: toDay.endOf("day").toDate(),
  };
}

export function toDateKey(date: Date): string {
  return dayjs(date).tz(SHANGHAI_TIME_ZONE).format(DATE_FORMAT);
}

export function parseDateKeyToDate(dateKey: string): Date {
  return dayjs.tz(dateKey, DATE_FORMAT, SHANGHAI_TIME_ZONE).startOf("day").toDate();
}

export function shanghaiTodayDateKey(): string {
  return dayjs().tz(SHANGHAI_TIME_ZONE).format(DATE_FORMAT);
}

