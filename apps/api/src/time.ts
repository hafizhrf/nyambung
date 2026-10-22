export function wibDate(now = new Date()) { return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10); }
export function nextReset(now = new Date()) { return new Date(Date.parse(`${wibDate(now)}T00:00:00+07:00`) + 86400000).toISOString(); }
export function addDays(date: string, days: number) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
