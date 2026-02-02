import { Parser } from 'json2csv';

/**
 * Converts an array of JSON objects into a CSV string.
 *
 * @param data - The array of objects to convert into CSV.
 * @returns The CSV string representation of the data.
 * @throws If the data cannot be converted into CSV.
 */
export function createCsv<T>(data: T[]): string {
  if (!data || data.length === 0) {
    throw new Error('No data available to convert to CSV.');
  }

  try {
    const parser = new Parser({
      transforms: [
        (item) => {
          // Remove newline characters from all string fields
          const transformed: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(item)) {
            if (typeof value === 'string') {
              // Replace all newline characters (both \n and \r) with a space
              transformed[key] = value.replace(/[\r\n]+/g, ' ');
            } else {
              transformed[key] = value;
            }
          }
          return transformed;
        },
      ],
    });
    return parser.parse(data);
  } catch (error) {
    throw new Error(`Failed to convert data to CSV: ${error.message}`);
  }
}
