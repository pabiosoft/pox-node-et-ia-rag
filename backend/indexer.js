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

async function ensureCollection() {
    try {
        await qdrant.getCollection(COLLECTION_NAME);
        console.log(`📚 Collection "${COLLECTION_NAME}" existe déjà`);
    } catch (err) {
        console.log(`📚 Création de la collection "${COLLECTION_NAME}"...`);
        await qdrant.createCollection(COLLECTION_NAME, {
            vectors: {
                size: 1536, // OpenAI text-embedding-ada-002
                distance: 'Cosine'
            }
        });
        console.log(`✅ Collection "${COLLECTION_NAME}" créée`);
    }
}

async function indexCorpus() { 
    // ✅ Créer la collection si elle n'existe pas
    await ensureCollection();
    
    console.log('📂 Lecture du corpus...');
    const files = fs.readdirSync(CORPUS_DIR).filter(file => file.endsWith('.json'));
    
    if (files.length === 0) {
        console.log('⚠️ Aucun fichier .json trouvé dans le dossier corpus/');
        return;
    }

    for (const file of files) {
        const filePath = path.join(CORPUS_DIR, file);
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const doc = JSON.parse(rawData);

        if (!doc.text || typeof doc.text !== 'string') {
            console.warn(`⚠️ Skipping ${file} - missing or invalid "text" field.`);
            continue;
        }

        try {
            console.log(`🔄 Indexation de ${file}...`);
            
            const embedding = await openai.embeddings.create({
                model: 'text-embedding-ada-002',
                input: doc.text,
            });

            const vector = embedding.data[0].embedding;
            const id = randomUUID(); // ✅ Retour à randomUUID qui marchait

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

            await qdrant.upsert(COLLECTION_NAME, {
                wait: true,
                points: [point],
            });

            console.log(`✅ Fichier ${file} indexé avec succès`);
        } catch (err) {
            console.error(`❌ Erreur lors de l'indexation de ${file} :`, err?.response?.data || err.message);
        }
    }

    console.log('🏁 Indexation terminée.');
}

indexCorpus().then(() => console.log('✅ Indexation terminée avec succès.')).catch(console.error);
