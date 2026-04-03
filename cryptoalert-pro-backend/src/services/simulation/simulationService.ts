import { supabaseAdmin } from '../../config/supabase.js';
import ccxt from 'ccxt';
import { logger } from '../../utils/logger.js';

const binance = new ccxt.binance();
const okx = new ccxt.okx();

const EXCHANGE_FEES = {
    binance: 0.001, // 0.1%
    okx: 0.001,
};

const TRANSFER_CONFIG = {
    USDT: { fee: 1, delay_ms: 1000 * 60 * 2 }, // 2 minutes delay
    BTC: { fee: 0.0005, delay_ms: 1000 * 60 * 10 }, // 10 minutes delay
};

export async function executeSimulatedTrade(
    userId: string,
    exchangeId: string,
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    price?: number
) {
    const exchange = exchangeId.includes('binance') ? binance : okx;
    const ticker = await exchange.fetchTicker(symbol);
    const executionPrice = price ?? (side === 'buy' ? ticker.ask : ticker.bid);

    if (!executionPrice) throw new Error('Could not fetch market price');

    const [base, quote] = symbol.split('/');
    const feeRate = EXCHANGE_FEES[exchangeId.replace('_sim', '') as keyof typeof EXCHANGE_FEES] || 0.001;
    const fee = amount * executionPrice * feeRate;

    // Transaction for atomic update in Supabase would be ideal,
    // but for simulation we can use simpler logic or RPC.

    const { data: balanceData, error: balanceError } = await supabaseAdmin
        .from('simulation_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('exchange', exchangeId);

    if (balanceError) throw balanceError;

    const quoteAsset = quote;
    const baseAsset = base;

    const quoteBalance = balanceData.find(b => b.asset === quoteAsset)?.balance || 0;
    const baseBalance = balanceData.find(b => b.asset === baseAsset)?.balance || 0;

    if (side === 'buy') {
        const cost = amount * executionPrice + fee;
        if (quoteBalance < cost) throw new Error('Insufficient virtual balance');

        await updateBalance(userId, exchangeId, quoteAsset, -cost);
        await updateBalance(userId, exchangeId, baseAsset, amount);
    } else {
        if (baseBalance < amount) throw new Error('Insufficient virtual asset balance');
        const gain = amount * executionPrice - fee;

        await updateBalance(userId, exchangeId, baseAsset, -amount);
        await updateBalance(userId, exchangeId, quoteAsset, gain);
    }

    await supabaseAdmin.from('simulation_trades').insert({
        user_id: userId,
        exchange: exchangeId,
        symbol,
        side,
        type: 'market',
        price: executionPrice,
        amount,
        fee,
        fee_asset: quoteAsset,
        total_cost_usd: side === 'buy' ? amount * executionPrice : -(amount * executionPrice)
    });

    await updateStats(userId);

    return { price: executionPrice, amount, fee };
}

async function updateBalance(userId: string, exchange: string, asset: string, delta: number) {
    const { data, error } = await supabaseAdmin.rpc('increment_sim_balance', {
        target_user_id: userId,
        target_exchange: exchange,
        target_asset: asset,
        delta: delta
    });

    if (error) {
        // Fallback if RPC not defined yet
        const { data: current } = await supabaseAdmin
            .from('simulation_accounts')
            .select('balance')
            .eq('user_id', userId)
            .eq('exchange', exchange)
            .eq('asset', asset)
            .single();

        const newBalance = (current?.balance || 0) + delta;
        await supabaseAdmin.from('simulation_accounts').upsert({
            user_id: userId,
            exchange,
            asset,
            balance: newBalance
        });
    }
}

export async function initiateSimulatedTransfer(
    userId: string,
    fromExchange: string,
    toExchange: string,
    asset: string,
    amount: number
) {
    const config = TRANSFER_CONFIG[asset as keyof typeof TRANSFER_CONFIG] || { fee: 0, delay_ms: 0 };

    // Check balance
    const { data: balance } = await supabaseAdmin
        .from('simulation_accounts')
        .select('balance')
        .eq('user_id', userId)
        .eq('exchange', fromExchange)
        .eq('asset', asset)
        .single();

    if (!balance || balance.balance < amount) throw new Error('Insufficient balance for transfer');

    await updateBalance(userId, fromExchange, asset, -amount);

    const { data: transfer, error } = await supabaseAdmin.from('simulation_transfers').insert({
        user_id: userId,
        from_exchange: fromExchange,
        to_exchange: toExchange,
        asset,
        amount: amount - config.fee,
        fee: config.fee,
        status: 'pending'
    }).select().single();

    if (error) throw error;

    // Simulate delay
    setTimeout(async () => {
        await updateBalance(userId, toExchange, asset, amount - config.fee);
        await supabaseAdmin.from('simulation_transfers')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', transfer.id);

        await updateStats(userId);
    }, config.delay_ms);

    return transfer;
}

async function updateStats(userId: string) {
    // Basic stats update logic
    const { data: accounts } = await supabaseAdmin.from('simulation_accounts').select('*').eq('user_id', userId);
    // In a real app we'd convert all to USD using live prices.
    // For MVP simulation, we'll focus on USDT balance + rough estimations.
    let totalEquity = 0;
    for (const acc of accounts || []) {
        if (acc.asset === 'USDT') {
            totalEquity += Number(acc.balance);
        } else {
            // simplified: assume 1 unit = 0 for now unless we fetch prices
            try {
                const ticker = await binance.fetchTicker(`${acc.asset}/USDT`);
                totalEquity += Number(acc.balance) * (ticker.last || 0);
            } catch { /* skip */ }
        }
    }

    const { data: stats } = await supabaseAdmin.from('simulation_stats').select('*').eq('user_id', userId).single();
    const initial = stats?.initial_capital_usd || 20000;
    const roi = ((totalEquity - initial) / initial) * 100;

    await supabaseAdmin.from('simulation_stats').upsert({
        user_id: userId,
        total_equity_usd: totalEquity,
        roi_pct: roi,
        updated_at: new Date().toISOString()
    });
}
