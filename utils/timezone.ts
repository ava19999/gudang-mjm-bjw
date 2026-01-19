// FILE: utils/timezone.ts
export const WIB_TIMEZONE = 'Asia/Jakarta';
export const WIB_OFFSET_HOURS = 7;
export const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

// Mendapatkan waktu sekarang dalam WIB
// Note: Uses manual offset calculation to return a Date object with WIB time
// This is intentional as Intl.DateTimeFormat only formats strings, not Date objects
export const getWIBDate = (): Date => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + WIB_OFFSET_MS);
};

// Format tanggal dalam WIB (contoh: "17 Januari 2026")
export const formatDateWIB = (date: Date | string | number): string => {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
};

// Format tanggal pendek dalam WIB (contoh: "17 Jan 2026")
export const formatDateShortWIB = (date: Date | string | number): string => {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
};

// Format waktu dalam WIB (contoh: "14:30")
export const formatTimeWIB = (date: Date | string | number): string => {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

// Format tanggal dan waktu dalam WIB (contoh: "17 Jan 2026, 14:30")
export const formatDateTimeWIB = (date: Date | string | number): string => {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

// Mendapatkan ISO string dalam WIB (tanpa Z suffix)
// Note: Uses manual offset calculation as ISO strings require specific formatting
// Indonesia doesn't observe DST, so fixed offset is appropriate
export const getWIBISOString = (date?: Date | string | number): string => {
  const d = date ? new Date(date) : new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const wibDate = new Date(utc + WIB_OFFSET_MS);
  const offsetStr = `+${String(WIB_OFFSET_HOURS).padStart(2, '0')}:00`;
  return wibDate.toISOString().replace('Z', offsetStr);
};

// Mendapatkan tanggal hari ini dalam format YYYY-MM-DD (WIB)
export const getTodayWIB = (): string => {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: WIB_TIMEZONE,
  }).format(new Date());
};
