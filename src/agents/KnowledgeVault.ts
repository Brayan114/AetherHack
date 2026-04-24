import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

export interface VaultMemory {
    id: string;
    text: string;
    vector: number[];
}

export class KnowledgeVault {
    private static VAULT_DIR = path.join(__dirname, '..', '..', 'skills', 'knowledge_vault');
    private static INDEX_PATH = path.join(__dirname, '..', '..', 'skills', 'vault_index.json');
    private static db: VaultMemory[] = [];
    private static genAI: GoogleGenerativeAI;
    private static initialized = false;

    // Pure JavaScript Cosine Similarity
    private static cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    public static async initialize(apiKey: string) {
        if (!apiKey) {
            console.warn("[Vault] No Google API key provided. Knowledge Vault offline.");
            return;
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        
        let loadedFromDisk = false;
        if (existsSync(this.INDEX_PATH)) {
            try {
                const data = await fs.readFile(this.INDEX_PATH, 'utf8');
                this.db = JSON.parse(data);
                console.log(`[Vault] Loaded ${this.db.length} vectors from persistent memory.`);
                loadedFromDisk = true;
            } catch (e) {
                console.error("[Vault] Error parsing vault_index.json", e);
            }
        }

        // Always check directory to ingest new files not in DB
        await this.syncVaultFiles(loadedFromDisk);
        this.initialized = true;
    }

    private static async syncVaultFiles(loadedFromDisk: boolean) {
        if (!existsSync(this.VAULT_DIR)) {
            await fs.mkdir(this.VAULT_DIR, { recursive: true });
        }

        const files = await fs.readdir(this.VAULT_DIR);
        const mdFiles = files.filter(f => f.endsWith('.md'));

        let newlyIngested = 0;

        for (const file of mdFiles) {
            const filePath = path.join(this.VAULT_DIR, file);
            const content = await fs.readFile(filePath, 'utf8');
            
            // Simple chunking by Markdown Headers (## )
            // We split by double newline and regroup
            const chunks = content.split(/\n##\s+/).map(c => c.trim()).filter(c => c.length > 0);

            for (const chunk of chunks) {
                // Prepend header hash back since we split on it (except for first chunk if it starts with # )
                const normalizedChunk = chunk.startsWith('#') ? chunk : `## ${chunk}`;
                
                const chunkId = Buffer.from(normalizedChunk.substring(0, 50)).toString('base64');
                
                // Skip if already in DB
                if (this.db.find(entry => entry.id === chunkId)) continue;
                
                try {
                    // text-embedding-004 is Google's massive embedding model
                    const model = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
                    const result = await model.embedContent(normalizedChunk);
                    const embedding = result.embedding.values;

                    this.db.push({
                        id: chunkId,
                        text: normalizedChunk,
                        vector: embedding
                    });
                    newlyIngested++;
                } catch (e) {
                    console.error(`[Vault] Failed to embed chunk in ${file}`, e);
                }
            }
        }

        if (newlyIngested > 0) {
            console.log(`[Vault] Ingested and embedded ${newlyIngested} new knowledge chunks.`);
            await fs.writeFile(this.INDEX_PATH, JSON.stringify(this.db), 'utf8');
        }
    }

    public static async query(text: string, topK: number = 3): Promise<string> {
        if (!this.initialized || this.db.length === 0) return '';
        
        try {
            const model = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
            const result = await model.embedContent(text);
            const queryVector = result.embedding.values;

            const scoredEntries = this.db.map(entry => ({
                text: entry.text,
                score: this.cosineSimilarity(queryVector, entry.vector)
            }));

            // Sort by highest similarity
            scoredEntries.sort((a, b) => b.score - a.score);
            
            // Filter an arbitrary similarity threshold (e.g., > 0.45)
            const topMatches = scoredEntries.filter(entry => entry.score > 0.45).slice(0, topK);

            if (topMatches.length === 0) return '';

            return topMatches.map(m => m.text).join('\n\n');
        } catch (e) {
            console.error("[Vault] Query failed:", e);
            return '';
        }
    }
}
