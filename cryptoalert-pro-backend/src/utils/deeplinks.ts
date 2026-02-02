export type Exchange = 'binance' | 'okx' | 'bybit';
export type Side = 'buy' | 'sell';

interface DeepLinkParams {
  exchange: Exchange;
  symbol: string; // e.g. BTCUSDT or BTC-USDT
  side: Side;
  price?: number;
}

export function generateDeepLink({ exchange, symbol, side, price }: DeepLinkParams): string {
  const sideFormatted = side.toUpperCase();
  const priceParam = price ? `&price=${price}` : '';

  switch (exchange) {
    case 'binance':
      // Binance uses symbol without dash, e.g. BTCUSDT
      const binanceSymbol = symbol.replace('-', '');
      return `binance://trade?symbol=${binanceSymbol}&side=${sideFormatted}${priceParam}`;

    case 'okx':
      // OKX uses instId with dash, e.g. BTC-USDT
      let okxSymbol = symbol;
      if (!symbol.includes('-')) {
        // Simple heuristic to add dash if missing (assuming USDT base)
        if (symbol.endsWith('USDT')) {
          okxSymbol = symbol.replace('USDT', '-USDT');
        }
      }
      const okxSide = side.toLowerCase();
      const okxPriceParam = price ? `&px=${price}` : '';
      return `okx://trade?instId=${okxSymbol}&side=${okxSide}${okxPriceParam}`;

    case 'bybit':
      const bybitSymbol = symbol.replace('-', '');
      const bybitSide = side.charAt(0).toUpperCase() + side.slice(1).toLowerCase(); // 'Buy' or 'Sell'
      return `bybitapp://open/trade?symbol=${bybitSymbol}&side=${bybitSide}${priceParam}`;

    default:
      return '';
  }
}

export function generateWebLink({ exchange, symbol, side }: DeepLinkParams): string {
  const binanceSymbol = symbol.replace('-', '');
  switch (exchange) {
    case 'binance':
      return `https://www.binance.com/en/trade/${binanceSymbol}`;
    case 'okx':
      const okxSymbol = symbol.includes('-') ? symbol : symbol.replace('USDT', '-USDT');
      return `https://www.okx.com/trade-spot/${okxSymbol.toLowerCase()}`;
    case 'bybit':
      return `https://www.bybit.com/en-US/trade/spot/${binanceSymbol}/USDT`;
    default:
      return '';
  }
}
