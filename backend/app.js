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
const qdrant = new QdrantClient({ url: 'http://vectordb:6333' });

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

        const search = await qdrant.search('corpus', {
            vector,
            limit: 3,
            with_payload: true,
        });

        if (search.length === 0) {
            return res.json({
                answer: "Désolé, je n'ai pas d'informations sur ce sujet.",
                sources: []
            });
        }

        const contextChunks = search.map(hit => hit.payload.text).join('\n---\n');

        const prompt = `
            Tu es une IA spécialisée dans la recherche documentaire.
            Voici les extraits disponibles :
            
            ${contextChunks}
            
            Réponds précisément à la question suivante :
            "${question}"
            `;

        const gptRes = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
        });

        const answer = gptRes.choices[0].message.content;

        // Nettoyage des sources invalides ou incomplètes
        const uniqueSources = [];
        const seen = new Set();

        for (const hit of search) {
            const { title, author, date } = hit.payload;
            if (title && author && date) {
                const key = `${title}-${author}-${date}`;
                if (!seen.has(key)) {
                    uniqueSources.push({ title, author, date });
                    seen.add(key);
                }
            }
        }

        res.json({ answer, sources: uniqueSources });

    } catch (err) {
        console.error('❌ Erreur /ask:', err.message);
        res.status(500).json({ error: 'Erreur serveur: problème avec l’API OpenAI' });
    }
});

app.listen(3000, () => {
    console.log('🧠 App listening on http://localhost:3000');
});
