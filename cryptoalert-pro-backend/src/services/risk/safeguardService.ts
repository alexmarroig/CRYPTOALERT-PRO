import { logger } from '../../utils/logger.js';
import { supabaseAdmin } from '../../config/supabase.js';

interface RiskConfig {
    maxDailyDrawdownPct: number;
    maxSingleTradeLossPct: number;
    volatilityThreshold: number;
}

const DEFAULT_CONFIG: RiskConfig = {
    maxDailyDrawdownPct: 5,     // 5% daily loss limit
    maxSingleTradeLossPct: 2,   // 2% per trade limit
    volatilityThreshold: 0.1,  // 10% volatility spike limit
};

export async function validateTrade(userId: string, symbol: string, amount: number, price: number) {
    const { data: stats } = await supabaseAdmin.from('simulation_stats').select('*').eq('user_id', userId).single();
    if (!stats) return true;

    // 1. Check Max Drawdown
    if (stats.max_drawdown_pct > DEFAULT_CONFIG.maxDailyDrawdownPct) {
        logger.warn(`Trade blocked: Max daily drawdown exceeded for user ${userId}`);
        return false;
    }

    // 2. Check Volatility
    const { data: recentPrice } = await supabaseAdmin
        .from('simulation_trades')
        .select('price')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

    if (recentPrice) {
        const change = Math.abs(price - recentPrice.price) / recentPrice.price;
        if (change > DEFAULT_CONFIG.volatilityThreshold) {
            logger.warn(`Trade blocked: High volatility detected for ${symbol}`);
            return false;
        }
    }

    return true;
}

export async function checkStopLoss(userId: string, tradeId: string, currentPrice: number) {
    const { data: trade } = await supabaseAdmin.from('simulation_trades').select('*').eq('id', tradeId).single();
    if (!trade) return;

    const loss = trade.side === 'buy'
        ? (trade.price - currentPrice) / trade.price
        : (currentPrice - trade.price) / trade.price;

    if (loss * 100 > DEFAULT_CONFIG.maxSingleTradeLossPct) {
        logger.info(`🚨 Stop Loss Triggered for ${trade.symbol}! Loss: ${(loss * 100).toFixed(2)}%`);
        // Automatic sell/cover logic would go here
    }
}
