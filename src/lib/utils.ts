import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Checks if a reminder (one-off or recurring) occurs on a given date (YYYY-MM-DD).
 */
export function isReminderOnDate(r: any, targetDateStr: string): boolean {
  if (!r) return false;
  const rawDate = r.remind_at || r.remindAt || r.time;
  if (!rawDate) return false;

  const reminderDateStr = String(rawDate).slice(0, 10);

  // Exact date match
  if (reminderDateStr === targetDateStr) return true;

  // Cannot occur before its start date
  if (targetDateStr < reminderDateStr) return false;

  const repeat = String(r.repeat_type || r.repeatType || 'none').toLowerCase().trim();
  if (repeat === 'none' || !repeat) return false;

  const [tYear, tMonth, tDay] = targetDateStr.split('-').map(Number);
  const [rYear, rMonth, rDay] = reminderDateStr.split('-').map(Number);
  if (!tYear || !tMonth || !tDay || !rYear || !rMonth || !rDay) return false;

  const targetDate = new Date(tYear, tMonth - 1, tDay);
  const reminderDate = new Date(rYear, rMonth - 1, rDay);

  const isDaily = repeat === 'daily' || repeat === 'day' || repeat.includes('день') || repeat.includes('day');
  if (isDaily) return true;

  const isWeekly = repeat === 'weekly' || repeat === 'week' || repeat.includes('недел') || repeat.includes('week');
  if (isWeekly) return targetDate.getDay() === reminderDate.getDay();

  const isMonthly = repeat === 'monthly' || repeat === 'month' || repeat.includes('месяц') || repeat.includes('month');
  if (isMonthly) {
    const daysInTargetMonth = new Date(tYear, tMonth, 0).getDate();
    if (rDay > daysInTargetMonth) {
      return tDay === daysInTargetMonth;
    }
    return tDay === rDay;
  }

  const isYearly = repeat === 'yearly' || repeat === 'year' || repeat.includes('год') || repeat.includes('year');
  if (isYearly) {
    if (rMonth === 2 && rDay === 29) {
      const isTargetLeap = new Date(tYear, 1, 29).getMonth() === 1;
      if (!isTargetLeap && tMonth === 2 && tDay === 28) return true;
    }
    return tMonth === rMonth && tDay === rDay;
  }

  return false;
}

export function getRepeatLabel(repeatType?: string): string | null {
  if (!repeatType || repeatType === 'none') return null;
  const lower = repeatType.toLowerCase();
  if (lower.includes('month') || lower.includes('месяц')) return 'Каждый месяц';
  if (lower.includes('week') || lower.includes('недел')) return 'Каждую неделю';
  if (lower.includes('day') || lower.includes('день')) return 'Каждый день';
  if (lower.includes('year') || lower.includes('год')) return 'Каждый год';
  return null;
}

