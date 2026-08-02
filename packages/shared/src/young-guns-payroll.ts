/**
 * Young Guns Plumbing payroll hour rules (display / calculation).
 * Normal 07:00–17:00, 30-min lunch, OT after 17:00, Saturday all OT.
 */

export const YOUNG_GUNS_PAYROLL_TIMEZONE = 'Africa/Johannesburg';

export const YOUNG_GUNS_PAYROLL_RULES = {
  shiftStart: '07:00',
  shiftEnd: '17:00',
  lunchDeductionMinutes: 30,
  overtimeAfter: '17:00',
  saturdayAllOvertime: true,
  payrollChangesRequireApproval: true,
  correctionsAudited: true,
} as const;

export type YoungGunsPayrollRulesSummary = typeof YOUNG_GUNS_PAYROLL_RULES;

export type YoungGunsDailyHoursResult = {
  standardHours: number;
  overtimeHours: number;
  breakHours: number;
  saturdayOvertime: boolean;
  grossMinutes: number;
  netMinutes: number;
};

function parseTimeOnDate(dateIso: string, time: string, timeZone: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const probe = new Date(`${dateIso}T12:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDate = formatter.format(probe);
  const utcGuess = new Date(`${localDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`);
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = offsetFormatter.formatToParts(utcGuess);
  const offsetPart = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+2';
  const match = offsetPart.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  const offsetHours = match ? Number(match[1]) : 2;
  const offsetMinutes = match?.[2] ? Number(match[2]) : 0;
  const totalOffsetMinutes = offsetHours * 60 + Math.sign(offsetHours) * offsetMinutes;
  return new Date(Date.UTC(
    Number(localDate.slice(0, 4)),
    Number(localDate.slice(5, 7)) - 1,
    Number(localDate.slice(8, 10)),
    hours,
    minutes,
  ) - totalOffsetMinutes * 60_000);
}

function weekdayInTimezone(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday.slice(0, 3)] ?? 0;
}

function dateIsoInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** Apply Young Guns daily hour split from clock-in/out timestamps. */
export function calculateYoungGunsDailyHours(input: {
  clockInAt: Date;
  clockOutAt: Date;
  timeZone?: string;
}): YoungGunsDailyHoursResult {
  const timeZone = input.timeZone ?? YOUNG_GUNS_PAYROLL_TIMEZONE;
  const { clockInAt, clockOutAt } = input;

  if (clockOutAt.getTime() <= clockInAt.getTime()) {
    return {
      standardHours: 0,
      overtimeHours: 0,
      breakHours: 0,
      saturdayOvertime: false,
      grossMinutes: 0,
      netMinutes: 0,
    };
  }

  const grossMinutes = Math.floor((clockOutAt.getTime() - clockInAt.getTime()) / 60_000);
  const lunchMinutes =
    grossMinutes > 4 * 60 ? YOUNG_GUNS_PAYROLL_RULES.lunchDeductionMinutes : 0;
  const netMinutes = Math.max(0, grossMinutes - lunchMinutes);
  const breakHours = roundHours(lunchMinutes);
  const dateIso = dateIsoInTimezone(clockInAt, timeZone);
  const isSaturday = weekdayInTimezone(clockInAt, timeZone) === 6;

  if (isSaturday && YOUNG_GUNS_PAYROLL_RULES.saturdayAllOvertime) {
    return {
      standardHours: 0,
      overtimeHours: roundHours(netMinutes),
      breakHours,
      saturdayOvertime: true,
      grossMinutes,
      netMinutes,
    };
  }

  const shiftStart = parseTimeOnDate(dateIso, YOUNG_GUNS_PAYROLL_RULES.shiftStart, timeZone);
  const shiftEnd = parseTimeOnDate(dateIso, YOUNG_GUNS_PAYROLL_RULES.shiftEnd, timeZone);
  const overtimeStart = parseTimeOnDate(dateIso, YOUNG_GUNS_PAYROLL_RULES.overtimeAfter, timeZone);

  const standardWindowStart = Math.max(clockInAt.getTime(), shiftStart.getTime());
  const standardWindowEnd = Math.min(clockOutAt.getTime(), shiftEnd.getTime());
  const standardMinutes = Math.max(0, Math.floor((standardWindowEnd - standardWindowStart) / 60_000));

  const overtimeMinutes = Math.max(
    0,
    Math.floor((clockOutAt.getTime() - Math.max(clockInAt.getTime(), overtimeStart.getTime())) / 60_000),
  );

  const standardAfterLunch = Math.max(0, standardMinutes - lunchMinutes);
  const totalAccounted = standardAfterLunch + overtimeMinutes;

  return {
    standardHours: roundHours(Math.min(standardAfterLunch, netMinutes)),
    overtimeHours: roundHours(
      totalAccounted >= netMinutes
        ? Math.max(0, netMinutes - Math.min(standardAfterLunch, netMinutes))
        : overtimeMinutes,
    ),
    breakHours,
    saturdayOvertime: false,
    grossMinutes,
    netMinutes,
  };
}

/** Sum Young Guns hours from ordered clock-in/out pairs for one calendar day. */
export function aggregateYoungGunsHoursFromPairs(
  pairs: Array<{ clockInAt: Date; clockOutAt: Date }>,
  timeZone = YOUNG_GUNS_PAYROLL_TIMEZONE,
): YoungGunsDailyHoursResult {
  const totals = pairs.reduce(
    (acc, pair) => {
      const result = calculateYoungGunsDailyHours({ ...pair, timeZone });
      acc.standardHours += result.standardHours;
      acc.overtimeHours += result.overtimeHours;
      acc.breakHours += result.breakHours;
      acc.grossMinutes += result.grossMinutes;
      acc.netMinutes += result.netMinutes;
      acc.saturdayOvertime = acc.saturdayOvertime || result.saturdayOvertime;
      return acc;
    },
    {
      standardHours: 0,
      overtimeHours: 0,
      breakHours: 0,
      saturdayOvertime: false,
      grossMinutes: 0,
      netMinutes: 0,
    },
  );

  return {
    standardHours: Math.round(totals.standardHours * 100) / 100,
    overtimeHours: Math.round(totals.overtimeHours * 100) / 100,
    breakHours: Math.round(totals.breakHours * 100) / 100,
    saturdayOvertime: totals.saturdayOvertime,
    grossMinutes: totals.grossMinutes,
    netMinutes: totals.netMinutes,
  };
}
