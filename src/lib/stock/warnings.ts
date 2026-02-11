const HYDRATION_WARNING_PREFIX = "failed to fetch missing historical data";

function extractSymbolFromHydrationWarning(warning: string): string | null {
  const separatorIndex = warning.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const symbol = warning.slice(0, separatorIndex).trim().toUpperCase();
  const message = warning.slice(separatorIndex + 1).trim().toLowerCase();
  if (!message.startsWith(HYDRATION_WARNING_PREFIX)) {
    return null;
  }

  return symbol || null;
}

export function filterHydrationWarningsByAvailableSymbols(
  warnings: string[],
  availableSymbols: Set<string>,
): string[] {
  return warnings.filter((warning) => {
    const symbol = extractSymbolFromHydrationWarning(warning);
    if (!symbol) {
      return true;
    }
    return !availableSymbols.has(symbol);
  });
}
