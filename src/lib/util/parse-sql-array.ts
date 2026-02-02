export default function parseSQLArray<T>(array: string | T[] | null): T[] {
  if (!array || array === '{}') {
    return [];
  }

  // If the array is already an array of T, return it as is
  if (Array.isArray(array)) {
    return array;
  }

  // If the array is a string, parse it (assumed SQL string format)
  return array.slice(1, -1).split(',') as unknown as T[];
}
