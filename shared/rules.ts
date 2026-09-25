export const TIMEZONE = 'America/Edmonton';
export const NOTICE_MS = 72 * 60 * 60 * 1000;
export const MINUTE = 60000;
export type Format = 'online' | 'in-person';
export function canBook(start: number, now = Date.now()) { return Number.isFinite(start) && start >= now + NOTICE_MS; }
export function overlaps(a: number, b: number, c: number, d: number) { return a < d && b > c; }
export function dateKey(value: number | Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value); }
export function clockTime(value: number) { return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(value); }
export function fullDate(value: number) { return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(value); }
export function shiftDay(key: string, days: number) { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function monday(key: string) { const d = new Date(key + 'T12:00:00Z'); return shiftDay(key, -((d.getUTCDay() + 6) % 7)); }
// Resolve a wall-clock time in Edmonton, and reject nonexistent DST times.
export function zonedTimestamp(day: string, time: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time))
        throw new Error('Choose a valid date and time.');
    const desired = Date.parse(`${day}T${time}:00Z`);
    if (!Number.isFinite(desired))
        throw new Error('Choose a valid date and time.');
    let candidate = desired;
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    for (let i = 0; i < 4; i++) {
        const p = Object.fromEntries(fmt.formatToParts(candidate).map(x => [x.type, x.value]));
        const represented = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
        candidate += desired - represented;
    }
    const p = Object.fromEntries(fmt.formatToParts(candidate).map(x => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` !== day || `${p.hour}:${p.minute}` !== time)
        throw new Error('That time does not exist because of the daylight-saving change. Choose another time.');
    return candidate;
}
export function makeSlots(day: string, from: string, to: string, duration: number, now = Date.now()) {
    if (![15, 30, 45, 60].includes(duration))
        throw new Error('Choose a 15, 30, 45, or 60-minute meeting.');
    const start = zonedTimestamp(day, from), end = zonedTimestamp(day, to);
    if (start <= now)
        throw new Error('Availability must start in the future.');
    if (end <= start || end - start > 12 * 60 * MINUTE)
        throw new Error('Choose an end time after the start, up to 12 hours later.');
    if ((end - start) % (duration * MINUTE) !== 0)
        throw new Error('The time block must divide evenly into your meeting length.');
    if (start > now + 366 * 24 * 60 * MINUTE)
        throw new Error('Choose a date within the next year.');
    const slots = [];
    for (let n = start; n < end; n += duration * MINUTE)
        slots.push({ start: n, end: n + duration * MINUTE });
    return slots;
}
export function safeUrl(value: string) { if (!value)
    return ''; try {
    const u = new URL(value);
    if (u.protocol !== 'https:')
        throw 0;
    return u.toString();
}
catch {
    throw new Error('Use a complete https:// link.');
} }
