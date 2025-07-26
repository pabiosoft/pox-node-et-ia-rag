import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import { QdrantClient } from '@qdrant/js-client-rest';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY non défini dans .env');
    process.exit(1);
} 

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';

// const qdrant = new QdrantClient({ url: 'http://vectordb:6333' });
const qdrant = new QdrantClient({ url: qdrantUrl });

async function checkQdrant() {
    try {
        await qdrant.getCollections();
        console.log('🟢 Qdrant connecté');
    } catch (err) {
        console.error('❌ Erreur Qdrant:', err.message);
        process.exit(1);
    }
}
checkQdrant();

// Middlewares
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (_, res) => {
    res.render('index');
});

app.post('/ask', async (req, res) => {
    const question = req.body.question;
    if (!question || question.length > 1000) {
        return res.status(400).json({ error: 'Question invalide ou trop longue' });
    }

    const lower = question.toLowerCase().trim();
    const greetings = ['salut', 'bonjour', 'hello', 'coucou'];

    if (greetings.includes(lower)) {
        return res.json({
            answer: "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
            sources: []
        });
    }

    try {
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: question,
        });

        const vector = embeddingRes.data[0].embedding;

        // ✅ Seuil adaptatif selon la longueur de la question
        const wordCount = question.split(' ').length;
        let threshold = 0.85;
        
        if (wordCount <= 3) {
            threshold = 0.75; // Questions courtes : seuil plus permissif
        } else if (wordCount <= 6) {
            threshold = 0.80; // Questions moyennes
        }
        // Questions longues gardent 0.85


        const search = await qdrant.search('corpus', {
            vector,
            limit: 3,
            with_payload: true,
            score_threshold: threshold // ✅ Seuil de pertinence
        });

        if (search.length === 0) {
            return res.json({
                answer: "Désolé, je n'ai pas d'informations sur ce sujet dans ma base de connaissances.",
                sources: [] // ✅ Pas de sources si aucun résultat pertinent
            });
        }

        const contextChunks = search.map(hit => hit.payload.text).join('\n---\n');

        const prompt = `
Tu es un assistant IA spécialisé dans la recherche documentaire.

Contexte disponible :
${contextChunks}

Question : "${question}"

Instructions :
- Réponds uniquement en te basant sur le contexte fourni
- Si le contexte ne contient pas d'informations pertinentes, dis-le clairement
- Sois précis et factuel
- N'invente pas d'informations
`;

        const gptRes = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3 // ✅ Réponses plus précises
        });

        const answer = gptRes.choices[0].message.content;

        // ✅ Ne montrer que les sources utilisées pour la réponse
        const relevantSources = search.map(hit => ({
            title: hit.payload.title,
            author: hit.payload.author,
            date: hit.payload.date,
            score: Math.round(hit.score * 100) // Score de pertinence
        })).filter(src => src.title && src.author && src.date);

        res.json({ 
            answer, 
            sources: relevantSources,
            found: search.length > 0
        });

    } catch (err) {
        console.error('❌ Erreur /ask:', err.message);
        res.status(500).json({ error: 'Erreur serveur: problème avec l\'API OpenAI' });
    }
});

app.listen(3000, () => {
    console.log('🧠 App listening on http://localhost:3000');
});
