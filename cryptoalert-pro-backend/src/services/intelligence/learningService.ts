import { logger } from '../../utils/logger.js';

interface Neuron {
    weights: number[];
    bias: number;
    output?: number;
}

/**
 * Custom Lightweight Neural Network implementation
 * Using a simple Multi-Layer Perceptron (MLP) architecture
 */
export class CryptoML {
    private layers: Neuron[][] = [];
    private learningRate = 0.01;

    constructor(inputSize: number, hiddenSize: number, outputSize: number) {
        // Hidden Layer
        this.layers.push(Array.from({ length: hiddenSize }, () => ({
            weights: Array.from({ length: inputSize }, () => Math.random() * 2 - 1),
            bias: Math.random() * 2 - 1
        })));

        // Output Layer
        this.layers.push(Array.from({ length: outputSize }, () => ({
            weights: Array.from({ length: hiddenSize }, () => Math.random() * 2 - 1),
            bias: Math.random() * 2 - 1
        })));
    }

    private sigmoid(x: number) {
        return 1 / (1 + Math.exp(-x));
    }

    private sigmoidDerivative(x: number) {
        return x * (1 - x);
    }

    public feedForward(inputs: number[]) {
        let currentInputs = inputs;
        for (const layer of this.layers) {
            const nextInputs: number[] = [];
            for (const neuron of layer) {
                const sum = neuron.weights.reduce((acc, w, i) => acc + w * currentInputs[i], neuron.bias);
                neuron.output = this.sigmoid(sum);
                nextInputs.push(neuron.output);
            }
            currentInputs = nextInputs;
        }
        return currentInputs;
    }

    public train(inputs: number[], targets: number[]) {
        // 1. Forward Pass
        const outputs = this.feedForward(inputs);

        // 2. Backward Pass (Backpropagation)
        // Output Layer Error
        const outputLayer = this.layers[1];
        const outputGradients = outputs.map((out, i) => (targets[i] - out) * this.sigmoidDerivative(out));

        // Update Output Layer Weights
        const hiddenLayer = this.layers[0];
        outputLayer.forEach((neuron, i) => {
            neuron.weights = neuron.weights.map((w, j) => w + this.learningRate * outputGradients[i] * hiddenLayer[j].output!);
            neuron.bias += this.learningRate * outputGradients[i];
        });

        // Hidden Layer Error
        const hiddenGradients = hiddenLayer.map((out, i) => {
            const error = outputLayer.reduce((acc, neuron, j) => acc + neuron.weights[i] * outputGradients[j], 0);
            return error * this.sigmoidDerivative(out);
        });

        // Update Hidden Layer Weights
        hiddenLayer.forEach((neuron, i) => {
            neuron.weights = neuron.weights.map((w, j) => w + this.learningRate * hiddenGradients[i] * inputs[j]);
            neuron.bias += this.learningRate * hiddenGradients[i];
        });

        return outputs;
    }
}

export const cryptoIntelligence = new CryptoML(5, 10, 1); // 5 inputs (RSI, Volatility, Sentiment, etc.), 1 output (Action: Buy/Sell/Hold)

export async function learnFromTrade(tradeData: { rsi: number, volatility: number, sentiment: number, volume: number, trend: number }, success: boolean) {
    const inputs = [tradeData.rsi / 100, tradeData.volatility, tradeData.sentiment, tradeData.volume, tradeData.trend];
    const target = [success ? 1 : 0];

    cryptoIntelligence.train(inputs, target);
    logger.info(`Learned from trade. Success: ${success}`);
}
