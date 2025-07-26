import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

// Services
import { vectorService } from './services/vector.js';
import chatRoutes from './routes/chat.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utiliser le PORT depuis .env avec fallback
const PORT = process.env.PORT || 3000;

// Vérification des variables d'environnement
if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY non défini dans .env');
    process.exit(1);
} 

const app = express();

// Vérification de la connexion Qdrant au démarrage
async function checkConnections() {
    const isConnected = await vectorService.checkConnection();
    if (!isConnected) {
        process.exit(1);
    }
}
checkConnections();

// Middlewares
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (_, res) => {
    res.render('index');
});

// Routes API
app.use('/', chatRoutes);

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🧠 App listening on http://localhost:${PORT}`);
});
