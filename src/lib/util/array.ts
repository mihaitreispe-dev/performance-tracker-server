/**
 * Shuffles array in place using Fisher-Yates.
 * @param {Array} a items An array containing the items.
 */
export function shuffleInPlace<T>(a: T[]): T[] {
  let j: number;
  let i: number;
  let x: T;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}

/**
 * Creates a slice of array with at most n elements taken from the beginning.
 * If n > array.length, repeats the process until the target array is of n size.
 *
 * @param array The array to query.
 * @param n The number of elements to take.
 * @return Returns the slice of array.
 */
export function takeLoop<T>(array: Array<T>, n: number = array.length): T[] {
  if (array.length === n) {
    return array;
  }
  if (array.length > n) {
    return array.slice(0, n);
  }
  return array.concat([...Array(n - array.length).keys()].map((_, i) => array[i % array.length]));
}

type ArrayIterator<T, TResult> = (value: T, index: number, collection: T[]) => TResult;
export function compactMap<T, TResult>(
  collection: T[],
  iteratee: ArrayIterator<T, TResult | null | undefined>,
): TResult[] {
  const result: TResult[] = [];
  for (let index = 0; index < collection.length; index++) {
    const item = collection[index];
    const resultItem = iteratee(item, index, collection);
    if (resultItem !== null && resultItem !== undefined) {
      result.push(resultItem);
    }
  }
  return result;
}
