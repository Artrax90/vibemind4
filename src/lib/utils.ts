import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Checks if a reminder (one-off or recurring) occurs on a given date (YYYY-MM-DD).
 */
export function isReminderOnDate(r: any, targetDateStr: string): boolean {
  if (!r || !r.remind_at) return false;

  const reminderDateStr = r.remind_at.slice(0, 10);

  // Exact date match
  if (reminderDateStr === targetDateStr) return true;

  // Cannot occur before its start date
  if (targetDateStr < reminderDateStr) return false;

  const repeat = r.repeat_type || 'none';
  if (repeat === 'none') return false;

  const [tYear, tMonth, tDay] = targetDateStr.split('-').map(Number);
  const [rYear, rMonth, rDay] = reminderDateStr.split('-').map(Number);
  if (!tYear || !tMonth || !tDay || !rYear || !rMonth || !rDay) return false;

  const targetDate = new Date(tYear, tMonth - 1, tDay);
  const reminderDate = new Date(rYear, rMonth - 1, rDay);

  if (repeat === 'daily') {
    return true;
  }

  if (repeat === 'weekly') {
    return targetDate.getDay() === reminderDate.getDay();
  }

  if (repeat === 'monthly') {
    const daysInTargetMonth = new Date(tYear, tMonth, 0).getDate();
    if (rDay > daysInTargetMonth) {
      return tDay === daysInTargetMonth;
    }
    return tDay === rDay;
  }

  if (repeat === 'yearly') {
    if (rMonth === 2 && rDay === 29) {
      const isTargetLeap = new Date(tYear, 1, 29).getMonth() === 1;
      if (!isTargetLeap && tMonth === 2 && tDay === 28) return true;
    }
    return tMonth === rMonth && tDay === rDay;
  }

  return false;
}

