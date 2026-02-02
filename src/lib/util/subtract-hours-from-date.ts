import { subHours } from 'date-fns';

/**
 * Subtracts a specified number of hours from a given date.
 * @param date - The original date.
 * @param hours - The number of hours to subtract.
 * @returns A new date object with the hours subtracted.
 */
export function subtractHoursFromDate(date: Date, hours: number): Date {
  return subHours(date, hours);
}
