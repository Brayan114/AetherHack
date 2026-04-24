import { GoogleGenerativeAI } from '@google/generative-ai';

export type NeuralProviderType = 'gemini' | 'openai' | 'ollama' | 'anthropic' | 'mistral' | 'perplexity' | 'groq' | 'openrouter' | 'custom';

export interface NeuralSettings {
    provider: NeuralProviderType;
    apiKey: string;
    baseUrl: string;
    model: string;
}

export class NeuralLinkAdapter {
    /**
     * The Universal Target Resolver
     * Dynamically routes prompt data across isolated ecosystem providers.
     */
    static async streamAnalysis(prompt: string, settings: NeuralSettings, onChunk: (chunk: string) => void): Promise<string> {
        let fullText = '';

        if (settings.provider === 'gemini') {
            const genAI = new GoogleGenerativeAI(settings.apiKey || process.env.GOOGLE_API_KEY || '');
            const modelName = settings.model || 'gemini-2.5-flash';
            const model = genAI.getGenerativeModel({ model: modelName });
            
            const result = await model.generateContentStream(prompt);
            for await (const chunk of result.stream) {
                const textChunk = chunk.text();
                fullText += textChunk;
                onChunk(textChunk);
            }
            return fullText;
        } 
        
        // 1. ProviderMap API Routing
        const getProviderConfig = (settings: NeuralSettings) => {
            switch (settings.provider) {
                case 'anthropic':
                    return { endpoint: 'https://api.anthropic.com/v1/messages', defaultModel: 'claude-3-opus-20240229' };
                case 'mistral':
                    return { endpoint: 'https://api.mistral.ai/v1/chat/completions', defaultModel: 'mistral-large-latest' };
                case 'perplexity':
                    return { endpoint: 'https://api.perplexity.ai/chat/completions', defaultModel: 'sonar-medium-chat' };
                case 'ollama':
                    return { endpoint: 'http://127.0.0.1:11434/v1/chat/completions', defaultModel: 'llama3' };
                case 'openai':
                    return { endpoint: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o' };
                case 'groq':
                    return { endpoint: 'https://api.groq.com/openai/v1/chat/completions', defaultModel: 'llama3-70b-8192' };
                case 'openrouter':
                    return { endpoint: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'deepseek/deepseek-chat-v3-0324:free' };
                case 'custom':
                default:
                    return { endpoint: settings.baseUrl || '', defaultModel: settings.model || 'custom-model' };
            }
        };

        const config = getProviderConfig(settings);
        const endpoint = settings.baseUrl || config.endpoint;
        const model = settings.model || config.defaultModel;

        if (!endpoint) throw new Error("No valid endpoint derived. Ensure baseUrl is provided for Custom mappings.");

        // 2. Dynamic HeaderBuilder Engine
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (settings.provider === 'anthropic') {
            if (!settings.apiKey) throw new Error("Anthropic requires a valid secure x-api-key.");
            headers['x-api-key'] = settings.apiKey;
            headers['anthropic-version'] = '2023-06-01';
        } else if (settings.provider === 'openrouter') {
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
            headers['HTTP-Referer'] = 'http://localhost:3000';
            headers['X-Title'] = 'AetherHack AI Pentest Interface';
        } else if (settings.apiKey && settings.provider !== 'ollama') {
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
        }

        // 3. Payload Construction 
        let payload: any = {
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: true
        };

        if (settings.provider === 'anthropic') {
            payload.max_tokens = 4096; // Explicit boundary required by Anthropic Spec
        }

        // 4. REST Execution
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`[${settings.provider.toUpperCase()} API Exception] HTTP ${response.status}: ${errText}`);
        }

        if (!response.body) throw new Error("No body readable from streaming endpoint.");

        // 5. The Normalizer Engine
        const normalizeResponse = (parsed: any, provider: string): string => {
            if (provider === 'anthropic') {
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                    return parsed.delta.text;
                }
                return '';
            }
            // Standard OpenAI / Rest Compatible Ecosystem
            return parsed.choices?.[0]?.delta?.content || '';
        };

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                
                // Safe handling across various SSE stops conventions
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                
                if (trimmed.startsWith('data: ')) {
                    try {
                        const dataStr = trimmed.substring(6);
                        if (dataStr === '[DONE]') continue; // Defensive fall back
                        
                        const parsed = JSON.parse(dataStr);
                        const chunkContent = normalizeResponse(parsed, settings.provider);
                        
                        if (chunkContent) {
                            fullText += chunkContent;
                            onChunk(chunkContent);
                        }
                    } catch (e) {
                        // Suppress chunk malformation to avoid breaking entire response block
                    }
                }
            }
        }
        
        return fullText;
    }
}
