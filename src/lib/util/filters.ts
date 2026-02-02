export function notNullish<T>(it: T | null | undefined): it is T {
  return it !== null && it !== undefined;
}
