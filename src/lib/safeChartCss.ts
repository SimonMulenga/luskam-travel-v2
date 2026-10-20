const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const COLOR = /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|hsl)a?\((?:var\(--[A-Za-z_][A-Za-z0-9_-]{0,63}\)|[0-9.%\s,+/-]){1,120}\)|var\(--[A-Za-z_][A-Za-z0-9_-]{0,63}\)|transparent|currentColor|[A-Za-z]{1,20})$/;

export function isSafeChartCssIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

export function isSafeChartCssColor(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && COLOR.test(value);
}
