/** Joins truthy class names — the only class utility this project needs. */
export function cx(
  ...values: (string | false | null | undefined)[]
): string {
  return values.filter(Boolean).join(" ");
}
