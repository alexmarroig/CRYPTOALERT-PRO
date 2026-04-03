import { fetchNews } from '../newsService.js';
import { logger } from '../../utils/logger.js';

interface NewsItem {
    id: string;
    title: string;
    category?: string;
    impact?: number;
    sentiment?: 'bullish' | 'bearish' | 'neutral';
    scientific_weight?: number;
}

const SCIENTIFIC_WEIGHTS = {
    'ETF': 0.85,          // Institutional adoption = High impact
    'Regulation': 0.75,   // Policy changes = Significant impact
    'Hack': 0.95,         // Direct loss = Critical impact
    'Tech Update': 0.40,  // Long-term = Moderate impact
    'Listing': 0.50,      // Short-term pump = Moderate impact
    'General': 0.10,      // Noise = Low impact
};

export async function analyzeNewsSentiment() {
    logger.info('Analyzing news sentiment with scientific weights');
    const news = await fetchNews({ limit: 10, lang: 'en' });

    // Process items
    const newsItems = (news as any).items || [];
    const analyzed = (newsItems as any[]).map(item => {
        const title = item.title.toLowerCase();
        let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';

        // Basic NLP simulation
        if (title.includes('surge') || title.includes('bull') || title.includes('positive') || title.includes('adoption')) {
            sentiment = 'bullish';
        } else if (title.includes('crash') || title.includes('bear') || title.includes('negative') || title.includes('banned')) {
            sentiment = 'bearish';
        }

        const category = identifyCategory(title);
        const weight = SCIENTIFIC_WEIGHTS[category as keyof typeof SCIENTIFIC_WEIGHTS] || 0.1;

        return {
            ...item,
            sentiment,
            scientific_weight: weight,
            impact: sentiment === 'neutral' ? 0 : (sentiment === 'bullish' ? 1 : -1) * weight
        };
    });

    const aggregateSentiment = analyzed.reduce((sum, item) => sum + (item.impact || 0), 0) / analyzed.length;

    return {
        aggregateSentiment,
        news: analyzed
    };
}

function identifyCategory(title: string): string {
    if (title.includes('etf') || title.includes('institutional') || title.includes('fidelity') || title.includes('blackrock')) return 'ETF';
    if (title.includes('sec') || title.includes('regulation') || title.includes('court') || title.includes('law')) return 'Regulation';
    if (title.includes('hack') || title.includes('exploit') || title.includes('stolen') || title.includes('drain')) return 'Hack';
    if (title.includes('listing') || title.includes('binance lists') || title.includes('coinbase adds')) return 'Listing';
    if (title.includes('upgrade') || title.includes('fork') || title.includes('testnet') || title.includes('mainnet')) return 'Tech Update';
    return 'General';
}
