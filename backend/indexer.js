import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';

dotenv.config();

// Config
const CORPUS_DIR = './corpus';
const COLLECTION_NAME = 'corpus';

// Clients
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://vectordb:6333' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function indexCorpus() {
    console.log('📂 Lecture du corpus...');
    const files = fs.readdirSync(CORPUS_DIR).filter(file => file.endsWith('.json'));

    for (const file of files) {
        const filePath = path.join(CORPUS_DIR, file);
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const doc = JSON.parse(rawData);

        if (!doc.text || typeof doc.text !== 'string') {
            console.warn(`⚠️ Skipping ${file} - missing or invalid "text" field.`);
            continue;
        }

        try {
            const embedding = await openai.embeddings.create({
                model: 'text-embedding-ada-002',
                input: doc.text,
            });

            const vector = embedding.data[0].embedding;
            const id = randomUUID(); // ✅ compatible avec Qdrant

            const point = {
                id,
                vector,
                payload: {
                    text: doc.text,
                    title: doc.title || 'Inconnu',
                    author: doc.author || 'Anonyme',
                    date: doc.date || 'Non précisée',
                    category: doc.category || 'Divers',
                    source: file
                }
            };

            const res = await qdrant.upsert(COLLECTION_NAME, {
                wait: true,
                points: [point],
            });

            console.log(`✅ Fichier ${file} indexé :`, res);
        } catch (err) {
            console.error(`❌ Erreur lors de l'indexation de ${file} :`, err?.response?.data || err.message);
        }
    }

    console.log('🏁 Indexation terminée.');
}

indexCorpus().then(() => console.log('✅ Indexation terminée avec succès.'));
