const suffixRegionMap: Array<{ suffix: string; region: string }> = [
  { suffix: ".HK", region: "Hong Kong" },
  { suffix: ".SS", region: "China" },
  { suffix: ".SZ", region: "China" },
  { suffix: ".BJ", region: "China" },
  { suffix: ".T", region: "Japan" },
  { suffix: ".KS", region: "South Korea" },
  { suffix: ".KQ", region: "South Korea" },
  { suffix: ".TO", region: "Canada" },
  { suffix: ".V", region: "Canada" },
  { suffix: ".L", region: "United Kingdom" },
  { suffix: ".PA", region: "France" },
  { suffix: ".DE", region: "Germany" },
  { suffix: ".F", region: "Germany" },
  { suffix: ".SW", region: "Switzerland" },
  { suffix: ".MI", region: "Italy" },
  { suffix: ".AX", region: "Australia" },
  { suffix: ".SA", region: "Brazil" },
  { suffix: ".TW", region: "Taiwan" },
  { suffix: ".NS", region: "India" },
  { suffix: ".BO", region: "India" },
  { suffix: ".SI", region: "Singapore" },
  { suffix: ".JK", region: "Indonesia" },
  { suffix: ".KL", region: "Malaysia" },
];

const exchangeKeywordMap: Array<{ keyword: string; region: string }> = [
  { keyword: "hong kong", region: "Hong Kong" },
  { keyword: "shanghai", region: "China" },
  { keyword: "shenzhen", region: "China" },
  { keyword: "beijing", region: "China" },
  { keyword: "nasdaq", region: "US" },
  { keyword: "nyse", region: "US" },
  { keyword: "amex", region: "US" },
  { keyword: "tokyo", region: "Japan" },
  { keyword: "toronto", region: "Canada" },
  { keyword: "london", region: "United Kingdom" },
  { keyword: "frankfurt", region: "Germany" },
  { keyword: "sao", region: "Brazil" },
  { keyword: "b3", region: "Brazil" },
];

export function inferRegionFromSymbol(symbol: string): string {
  const normalized = symbol.toUpperCase();
  const bySuffix = suffixRegionMap.find((item) => normalized.endsWith(item.suffix));
  if (bySuffix) {
    return bySuffix.region;
  }

  if (/^[A-Z0-9^.-]+$/.test(normalized)) {
    return "US";
  }

  return "Unknown";
}

export function inferRegionFromExchange(
  exchangeName: string | undefined,
  symbol: string,
): string {
  const normalized = exchangeName?.toLowerCase() ?? "";
  const byExchange = exchangeKeywordMap.find((item) => normalized.includes(item.keyword));
  if (byExchange) {
    return byExchange.region;
  }
  return inferRegionFromSymbol(symbol);
}
