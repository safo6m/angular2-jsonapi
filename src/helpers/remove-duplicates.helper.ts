export function removeDuplicates<T>(items: Array<T>): Array<T> {
  const itemsSet: Set<T> = new Set(items);
  return Array.from(itemsSet);
}
