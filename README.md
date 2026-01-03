#  RAG Chat Bot

Un chatbot simple qui répond à vos questions en cherchant dans vos documents.

![RAG Chat Bot Demo](./backend/public/images/demo-screenshot.jpeg)

Features :
- [] Chatbot avec historique
- [x] Indexation de documents `.json` et `.xlsx`
- [x] Recherche vectorielle avec seuil adaptatif
- [x] Génération de réponse avec GPT
- [x] Affichage des sources
- [x] Gestion des salutations
- [ ] Tests unitaires
- [ ] Documentation
- [ ] Déploiement

##  Démarrage rapide

### 1. Cloner le projet
```bash
git clone hhttps://github.com/pabiosoft/pox-node-et-ia-rag.git
cd pox-node-et-ia-rag
```

### 2. Configuration
```bash
cd backend
cp .env.example .env
# Éditer .env et ajouter vos clés API
```

### 3. Lancer l'application
```bash
docker compose up --build
```

### 4. Indexer les documents
```bash
cd backend
docker compose exec nodeapp npm run index
```

### 5. Utiliser l'application
- **Chat** : http://localhost:8000
- **Qdrant Dashboard** : http://localhost:6333/dashboard

##  Recherche Web Automatique (Nouveau)

Le système peut maintenant rechercher automatiquement sur Internet lorsque aucune réponse n'est trouvée dans le corpus local et générer de nouveaux documents.

### Configuration requise

Ajoutez votre clé Serper dans `.env` :
```env
SERPER_KEY=votre_cle_serper_ici
```

> 💡 Obtenez une clé gratuite sur [https://serper.dev/](https://serper.dev/)

### Fonctionnement

1. **Détection automatique** : Lorsque l'IA ne trouve pas de réponse dans le corpus
2. **Recherche web** : Utilisation de Serper pour trouver des sources pertinentes
3. **Extraction de contenu** : Récupération du contenu des pages web
4. **Génération de document** : Création d'un document structuré avec GPT
5. **Sauvegarde automatique** : Le document est enregistré dans `backend/corpus/auto-generated/`
6. **Indexation automatique** : Le document est ajouté à la base vectorielle
7. **Réponse à l'utilisateur** : L'IA répond avec les informations trouvées

### Exemple de workflow

```
Utilisateur: "Quelles sont les dernières avancées en intelligence artificielle en 2024 ?"
    ↓
IA: "Je n'ai pas d'informations dans ma base..."
    ↓
🔍 Recherche web automatique...
    ↓
✅ Document généré: "Recherche: dernières avancées IA 2024..."
    ↓
🔄 Document indexé dans Qdrant
    ↓
IA: "J'ai trouvé des informations pertinentes sur le web et je les ai ajoutées à ma base...
     [Réponse détaillée avec les informations trouvées]"
```

### Structure des documents (format obligatoire)

**Tous les documents** (manuels et auto-générés) doivent suivre ce format strict pour être indexés :

```json
{
  "title": "Titre du document",
  "author": "Auteur",
  "date": "YYYY-MM-DD",
  "category": "Catégorie",
  "text": "Contenu textuel complet"
}
```

**Exemple de document auto-généré** :
```json
{
  "title": "Recherche: Quelles sont les dernières avancées en IA en 2024",
  "author": "IA Research Assistant",
  "date": "2024-12-26",
  "category": "IA",
  "text": "En 2024, les avancées en intelligence artificielle ont été marquées par..."
}
```

> ⚠️ **Important** : Tout document ne respectant pas ce format ne sera pas indexé par le système.

### Gestion des documents auto-générés

- **Dossier** : `backend/corpus/auto-generated/`
- **Format** : Fichiers JSON au format obligatoire
- **Réindexation** : Automatique via la file d'attente
- **Déduplication** : Vérification automatique des questions déjà recherchées

### Validation des documents

Un script de validation est disponible pour vérifier que tous les documents respectent le format obligatoire :

```bash
# Exécuter la validation
npm run validate
```

Ce script vérifie :
- Tous les champs obligatoires sont présents
- Les types de données sont corrects
- Le format de la date est valide (YYYY-MM-DD)
- Aucun champ supplémentaire n'est présent

Le script retourne un code d'erreur (1) si des documents sont invalides, ce qui permet de l'intégrer dans des pipelines CI/CD.

### Test de l'intégration Serper

Un script de test est disponible pour vérifier que l'intégration Serper fonctionne correctement :

```bash
# Tester la connexion Serper
npm run test-serper
```

Ce script :
- Vérifie la configuration de SERPER_KEY
- Effectue une recherche test
- Affiche les résultats
- Valide que l'API répond correctement

Idéal pour vérifier que votre clé Serper est valide et que l'intégration fonctionne avant de lancer l'application.

### Désactivation

Pour désactiver la recherche web, supprimez simplement la clé `SERPAPI_KEY` du fichier `.env`.

##  Ajouter des documents au corpus

1. Ajoutez vos fichiers `.json` dans `backend/corpus/`
2. Relancez l'indexer :
```bash
docker compose exec nodeapp npm run index
```

##  Stack technique

- Node.js + Express
- OpenAI API (GPT + Embeddings)
- Qdrant (base vectorielle)
- Docker
- Serper (recherche web)
- Cheerio (extraction de contenu)
- Axios (requêtes HTTP)

##  Licence

MIT - Voir [LICENSE](LICENSE)

##  Architecture Technique

### Nouveaux Services Ajoutés

#### 1. `webSearchService.js`
- **Responsabilité** : Recherche web et génération de documents
- **Fonctionnalités** :
  - Recherche avec Serper (API REST)
  - Extraction de contenu avec Cheerio
  - Génération de documents structurés avec GPT
  - Sauvegarde dans le système de fichiers
  - Détection de doublons

#### 2. `indexationQueue.js`
- **Responsabilité** : Gestion de l'indexation par lots
- **Fonctionnalités** :
  - File d'attente pour les documents à indexer
  - Traitement par lots (batch processing)
  - Gestion des erreurs et retries
  - Optimisation des performances

#### 3. Modifications dans `ragService.js`
- **Nouvelle méthode** : `handleWebSearchFallback()`
- **Intégration** : Détection des échecs et appel automatique à la recherche web
- **Workflow** : Gestion complète du processus de recherche et d'indexation

### Diagramme de Flux

```
┌───────────────────────────────────────────────────────┐
│                   Utilisateur Pose Question              │
└───────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────┐
│                   RAGService.processQuestion()          │
│                   1. Vérification salutations           │
│                   2. Recherche vectorielle             │
└───────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────┐
│                   Résultats trouvés ?                  │
├───────────────────────────────────────────────────────┤
│ Oui → Retourne réponse avec sources                   │
│ Non → Appelle handleWebSearchFallback()               │
└───────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────┐
│               WebSearchService.searchAndGenerate()     │
│               1. Recherche SerpAPI                     │
│               2. Extraction contenu pages              │
│               3. Génération document GPT               │
│               4. Sauvegarde fichier JSON               │
└───────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────┐
│               IndexationQueue.add()                    │
│               - Ajout à la file d'attente               │
│               - Traitement par lots                    │
│               - Indexation dans Qdrant                 │
└───────────────────────────────────────────────────────┘
                                    ↓
┌───────────────────────────────────────────────────────┐
│               Réponse à l'utilisateur                  │
│               - Confirmation de recherche              │
│               - Informations trouvées                  │
│               - Sources et métadonnées                 │
└───────────────────────────────────────────────────────┘
```

### Configuration et Variables d'Environnement

**Nouveaux paramètres dans `.env`** :
```env
# Recherche web
SERPER_KEY=votre_cle_serper
WEB_SEARCH_ENABLED=true
WEB_SEARCH_MAX_RESULTS=5
WEB_SEARCH_TIMEOUT=10000
```

### Bonnes Pratiques Implémentées

1. **Gestion des erreurs** : Try/catch à tous les niveaux avec fallbacks
2. **Optimisation** : Batch processing pour les indexations
3. **Sécurité** : Limitation des requêtes et timeouts
4. **Maintenabilité** : Code modulaire et bien documenté
5. **Compatibilité** : Intégration transparente avec le système existant

### Performances

- **Batch size** : 5 documents par lot (optimal pour OpenAI)
- **Concurrency** : 1 batch à la fois pour éviter la surcharge
- **Retry logic** : 3 tentatives avec backoff exponentiel
- **Timeouts** : 10 secondes par requête web

### Limites et Améliorations Futures

**Limites actuelles** :
- Dépendance à Serper (nécessite une clé API)
- Limite de 3 URLs scrapées par recherche
- Pas de système de cache pour les recherches web

**Améliorations possibles** :
- Ajouter un cache Redis pour les recherches web
- Implémenter un système de notation des sources
- Ajouter des tests unitaires complets
- Optimiser la déduplication avec des embeddings
- Ajouter un système de feedback utilisateur

