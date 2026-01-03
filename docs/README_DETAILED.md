# Documentation détaillée — pox-node-et-ia-rag

Cette documentation explique le fonctionnement du projet, son architecture, et commente les fichiers principaux en détails (but, flux, et explication ligne-par-ligne quand pertinent).

---

## 1. Vue d'ensemble

But du projet
- Prototype (PoC) d'une application Node.js utilisant la technique RAG (Retrieval-Augmented Generation).
- Permet d'indexer des documents (JSON + Excel) dans une base vectorielle (Qdrant), de calculer des embeddings via OpenAI, et de répondre à des questions en combinant recherche vectorielle + génération.

Composants principaux
- Backend Node.js (dossier `backend`) : serveur Express exposant des routes pour poser des questions (`/ask`) et gérer le corpus/Excel.
- Qdrant : vector DB utilisée pour stocker vecteurs et payloads.
- OpenAI : service d'API pour générer embeddings et prompts.
- Corpus : dossier `backend/corpus` contenant les documents JSON et un sous-dossier `excel/`.

---

## 2. Démarrage rapide

Prérequis
- Docker + Docker Compose (optionnel si vous avez Qdrant et Node en local)
- Node 18+ (si vous exécutez localement)
- Clé OpenAI dans `backend/.env` (variable `OPENAI_API_KEY`)

Commandes utiles
```bash
# lancer en local avec docker-compose (depuis la racine)
docker compose up --build

# ou en développement local (Backend seul)
cd backend
npm install
npm run dev

# indexer le corpus (créera la collection si nécessaire et indexera les documents)
cd backend
npm run index
```

---

## 3. Structure du dépôt (rapide)

- `backend/`
  - `app.js` : point d'entrée Express.
  - `indexer.js` : script pour indexer le corpus.
  - `services/` : logique métier (rag, vector, indexer, corpus, etc.).
  - `routes/` : routes Express (`chat.js`, `corpus.js`).
  - `corpus/` : documents JSON et dossier `excel/`.
  - `.env` : variables d'environnement.

- `compose.yml` : docker-compose pour nodeapp + qdrant.

---

## 4. Explication détaillée des fichiers principaux

Je présente ci-dessous les fichiers essentiels avec commentaires explicatifs (pour comprendre chaque partie). Pour la lisibilité, je commente les blocs clés et fournis une explication ligne-par-ligne là où c'est important.

### 4.1 `backend/app.js`

But
- Configure et démarre l'application Express, vérifie les connexions (OpenAI key, Qdrant) et enregistre les routes.

Contenu annoté (résumé des blocs)

- Import et config
  - `import dotenv from 'dotenv';` : charge les variables d'environnement depuis `.env`.
  - `import { vectorService } from './services/vector.js';` : service pour Qdrant.
  - `import chatRoutes from './routes/chat.js';` : routes pour `/ask`.
  - `import corpusRoutes from './routes/corpus.js';` : routes pour gestion du corpus.

- Vérification des variables d'environnement
  - Le code vérifie `OPENAI_API_KEY` et stoppe le process si absent : utile pour éviter des erreurs runtime plus tard.

- Middleware CORS
  - `allowedOrigins` et `dashlabPattern` limitent qui peut appeler l'API.
  - `app.use(cors(corsOptions));` applique ces règles.

- Vérification Qdrant au démarrage
  - `vectorService.checkConnection()` tente d'appeler Qdrant et quitte le process si Qdrant non joignable.

- Middlewares standards
  - `bodyParser.json()` pour parser JSON; `express.static` sert les assets publics; pug pour les vues.

- Routes
  - `app.use('/', chatRoutes);` expose `/ask`.
  - `app.use('/', corpusRoutes);` expose `/corpus` et `/corpus/upload`.

- Démarrage
  - `app.listen(PORT, ...)` démarre le serveur.

Pourquoi c'est important
- `app.js` initialise l'application, mais n'indexe pas automatiquement le corpus — c'est bien `indexer.js` qui s'en charge.


### 4.2 `backend/config/database.js`

But
- Centralise la configuration des clients externes : Qdrant et OpenAI.

Points clés ligne-par-ligne (résumé)
- `dotenv.config()` : charge `.env` (important pour `OPENAI_API_KEY`, `QDRANT_URL`).
- `new QdrantClient({ url: process.env.QDRANT_URL || 'http://vectordb:6333' })` : crée un client Qdrant. Par défaut, dans Docker, `vectordb` est résolu via le réseau docker.
- `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` : crée le client OpenAI.
- `COLLECTION_NAME = 'corpus'` : nom de la collection Qdrant utilisée (doit exister ou être créée via l'indexeur).
- `VECTOR_SIZE = 1536` : dimension des embeddings attendus (OpenAI embeddings classiques).

Conseil
- Si vous exécutez hors de Docker et que Qdrant est sur localhost, assurez-vous que `QDRANT_URL` pointe vers `http://localhost:6333`.


### 4.3 `backend/routes/chat.js`

But
- Fournit l'API `POST /ask` qui reçoit une `question` et appelle `ragService.processQuestion(question)`.

Bloc important
- Validation simple : refuse question vide ou >1000 caractères.
- Le try/catch remonte une 500 en cas d'erreur et logge `error.message`.

Pourquoi vous voyiez `Not Found` dans les logs
- `Not Found` remonte normalement d'une requête vers Qdrant (via `vectorService.search`) si la collection n'existe pas.
- Dans `ragService.processQuestion`, une exception est catchée et rethrowée; l'appel depuis la route attrape l'erreur, logge `Erreur dans /ask: Not Found` et renvoie une 500.


### 4.4 `backend/services/rag.js`

But
- Implémente le flux RAG complet : génération d'embedding, recherche vectorielle, construction du contexte et génération de réponse via OpenAI.

Fonctions clés et rôle
- `isGreeting()` : règle simple pour détecter salutations et répondre localement.
- `generateEmbedding(question)` : appelle `openai.embeddings.create` (modèle `text-embedding-ada-002`) et retourne le vecteur.
  - Point à vérifier : version du SDK OpenAI. Ici, la syntaxe correspond à un ancien client; selon la version installée (`openai` v5+), l'appel peut différer (mais le code actuel paraît adapté à v5 car `openai.embeddings.create` est utilisé dans d'autres fichiers aussi).
- `vectorService.getAdaptiveThreshold(question)` : calcule un seuil de similarité selon la longueur de la question.
- `vectorService.search(vector, 3, threshold)` : recherche les k meilleurs documents dans Qdrant.
- Fallback : si aucun résultat et threshold > 0.7, retente avec 0.7.
- Si aucun résultat, renvoie une réponse friendly indiquant qu'aucune info n'a été trouvée (found: false).
- `generateAnswer(question, context)` : construit un prompt long et appelle `openai.chat.completions.create`.
  - Remarque : selon la version du client OpenAI/SDK, la méthode et champs peuvent différer — surveillez les erreurs liées à la forme des appels.
- `formatSources(searchResults)` : transforme les résultats Qdrant en une liste de sources uniques prêtes à être affichées.

Points d'attention
- Gestion des erreurs : toute erreur est loggée et relancée pour que la route renvoie 500.
- Performance : l'appel aux embeddings et à la recherche peut être lent; pensez à mettre des timeouts ou métriques.


### 4.5 `backend/services/vector.js`

But
- Abstraction des appels Qdrant : `checkConnection()` et `search()`.

Points critiques
- `search()` appelle `qdrant.search(COLLECTION_NAME, { vector, limit, with_payload: true, score_threshold })`.
  - Si la collection `corpus` n'existe pas, Qdrant renverra une erreur `Not Found` ou similaire (HTTP 404). C'est l'origine de ton message d'erreur.
- `checkConnection()` tente `qdrant.getCollections()` et renvoie false en cas d'erreur.


### 4.6 `backend/services/indexer.js`

But
- Lit les documents JSON (dossier `corpus`) et les fichiers Excel (dossier `corpus/excel`), calcule des embeddings et upserte des points dans Qdrant.

Flux principal
- `reindexCorpus()` : crée/assure la collection (avec purge si demandé), charge JSON + Excel, puis `indexDocuments()`.
- `indexDocuments()` : pour chaque document, appelle OpenAI pour obtenir l'embedding, construit un point (id, vector, payload) et `qdrant.upsert`.

Erreurs possibles
- Si `indexDocuments()` n'a jamais été exécuté et la collection n'existe pas, les appels `search()` feront échouer `Not Found`.

Conseil opérationnel
- Exécuter `npm run index` (ou `docker compose exec nodeapp npm run index`) pour créer la collection et indexer le corpus.
- L'indexeur avertit si un JSON ne contient pas de champ `text` (les nouveaux documents doivent contenir `text` pour être indexés par le script actuel). Les fichiers ajoutés dans `backend/corpus` doivent donc inclure un champ `text` si tu veux qu'ils soient pris en compte.


### 4.7 `backend/routes/corpus.js`

But
- Permet de lister les fichiers Excel (`GET /corpus`) et d'uploader un fichier Excel (`POST /corpus/upload`).
- Use `multer` pour gérer le dépôt du fichier dans `backend/corpus/excel` et ensuite appelle `indexerService.indexExcelFile()` pour indexer le contenu du fichier uploadé.

Points importants
- Le routeur renvoie des erreurs lisibles (400 si pas de fichier reçu, 404 si fichier introuvable, etc.).
- La route `/corpus/excel` sert en statique les fichiers Excel (déclaré dans `app.js`).


### 4.8 `compose.yml`

Rôle
- Définit deux services : `nodeapp` (ton backend) et `vectordb` (qdrant).
- Monte `./backend/corpus` dans le container pour que Qdrant et le nodeapp partagent le même corpus de fichiers Excel.
- `vectordb` a un `healthcheck` pour s'assurer qu'il est prêt avant de lancer `nodeapp`.


## 5. FAQ / Vérifications courantes

Q: Pourquoi j'obtiens `Not Found` dans les logs ?
- R: La collection `corpus` n'existe pas dans Qdrant (ou Qdrant n'est pas joignable). Crée la collection ou exécute l'indexeur (`npm run index`) pour la créer.

Q: Comment indexer mes nouveaux documents JSON ?
- R: Les JSON doivent contenir un champ `text` (string) pour être indexés par `indexer.js`. Sinon, le fichier sera ignoré.

Q: Puis-je indexer de gros fichiers Excel ?
- R: Oui, mais attention aux quotas OpenAI car chaque chunk passe par `openai.embeddings.create`. Tu peux adapter la segmentation dans `indexer.js`.


## 6. Suggestions d'améliorations rapides

- Rendre l'indexeur idempotent et plus robuste (logs plus détaillés, métriques).
- Ajouter une route d'administration pour lancer le `reindexCorpus` depuis l'API (avec authentification).
- Ajouter une création automatique de collection si absente lors du démarrage (`app.js`), plutôt que de quitter.
- Documenter et standardiser le format JSON attendu pour les documents (ex: `id`, `title`, `text`, `author`, `date`, `tags`).


## 7. Fichiers annotés (extraits commentés)

Ci-dessous quelques extraits annotés (pour ne pas rendre ce document trop volumineux, je fournis les parties les plus critiques — si tu veux, je peux générer un fichier séparé avec chaque fichier entièrement commenté ligne-par-ligne).

#### Extrait: `backend/services/vector.js`

```js
// checkConnection: vérifie que Qdrant répond
async checkConnection() {
    try {
        await qdrant.getCollections(); // demande la liste des collections
        console.log('🟢 Qdrant connecté');
        return true;
    } catch (err) {
        console.error('❌ Erreur Qdrant:', err.message);
        return false; // appelant (app.js) arrêtera le process
    }
}

// search: effectue la recherche vectorielle dans la collection
async search(vector, limit = 3, scoreThreshold = 0.75) {
    try {
        const results = await qdrant.search(COLLECTION_NAME, {
            vector,
            limit,
            with_payload: true,
            score_threshold: scoreThreshold
        });
        return results; // tableau de hits (objet {id, score, payload})
    } catch (err) {
        console.error('❌ Erreur de recherche vectorielle:', err.message);
        throw err; // remontera jusqu'à la route et provoquera la 500
    }
}
```

---

## 8. Prochaines étapes (pour moi)

- Si tu veux, je peux :
  - 1) Générer un fichier `docs/README_FULL_ANNOTATED.md` avec chaque fichier commenté ligne-par-ligne (gros travail, je le ferai fichier-par-fichier).
  - 2) Commiter les fichiers docs et pousser sur la branche `excel-rag`.
  - 3) Exécuter localement `npm run index` (ou via Docker) pour créer la collection et indexer les documents (attention aux coûts OpenAI).

Dis-moi quelle option tu veux que j'exécute en suite : générer la doc complète par fichier, commit+push la doc, ou lancer l'indexeur.
