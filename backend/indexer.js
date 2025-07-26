import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { qdrant, openai, COLLECTION_NAME } from './config/database.js';

// Config
const CORPUS_DIR = './corpus';

async function ensureCollection() {
    try {
        const collection = await qdrant.getCollection(COLLECTION_NAME);
        console.log(`📚 Collection "${COLLECTION_NAME}" existe avec ${collection.points_count} points`);
        
        if (collection.points_count > 0) {
            console.log(`🗑️ Suppression de ${collection.points_count} points existants...`);
            
            //  Supprimer tous les points sans recréer la collection
            await qdrant.delete(COLLECTION_NAME, {
                wait: true,
                filter: {} // Filtre vide = supprimer tout
            });
            
            console.log(`✅ Collection vidée avec succès`);
        }
        
    } catch (err) {
        console.log(`📚 Création de la collection "${COLLECTION_NAME}"...`);
        await qdrant.createCollection(COLLECTION_NAME, {
            vectors: {
                size: 1536,
                distance: 'Cosine'
            }
        });
        console.log(`✅ Collection "${COLLECTION_NAME}" créée`);
    }
}

async function indexCorpus() { 
    //  Créer la collection si elle n'existe pas
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
            const id = randomUUID(); 

            const point = {
                id,
                vector,
                payload: {
                    text: doc.text,
                    title: doc.title || 'Inconnu',
                    author: doc.author || 'Anonyme',
                    date: doc.date || 'Non précisée',
                    category: doc.category || 'Divers',
                    tags: doc.tags || [],
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
