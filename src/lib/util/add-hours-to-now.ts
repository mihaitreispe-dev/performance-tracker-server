import { addHours } from 'date-fns';

/**
 * Adds a specified number of hours to a given date.
 * @param date - The original date.
 * @param hours - The number of hours to add.
 * @returns A new date object with the hours added.
 */
export function addHoursToDate(date: Date, hours: number) {
  return addHours(date, hours);
}
