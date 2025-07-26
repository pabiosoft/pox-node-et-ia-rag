import { openai } from '../config/database.js';
import { vectorService } from './vector.js';

/**
 * Service RAG principal - gère le cycle complet de question-réponse
 */
export class RAGService {
    /**
     * Traite une question utilisateur avec RAG
     * @param {string} question - Question de l'utilisateur
     * @returns {Promise<Object>} Réponse avec answer, sources et found
     */
    async processQuestion(question) {
        // Gestion des salutations
        if (this.isGreeting(question)) {
            return {
                answer: "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
                sources: [],
                found: true
            };
        }

        try {
            // 1. Génération de l'embedding
            const vector = await this.generateEmbedding(question);

            // 2. Recherche vectorielle avec seuil adaptatif
            const threshold = vectorService.getAdaptiveThreshold(question);
            const searchResults = await vectorService.search(vector, 3, threshold);

            if (searchResults.length === 0) {
                return {
                    answer: "Désolé, je n'ai pas d'informations sur ce sujet dans ma base de connaissances.",
                    sources: [],
                    found: false
                };
            }

            // 3. Préparation du contexte
            const context = this.buildContext(searchResults);

            // 4. Génération de la réponse
            const answer = await this.generateAnswer(question, context);

            // 5. Formatage des sources
            const sources = this.formatSources(searchResults);

            return {
                answer,
                sources,
                found: true
            };

        } catch (error) {
            console.error('❌ Erreur dans processQuestion:', error.message);
            throw error;
        }
    }

    /**
     * Génère un embedding pour la question
     * @param {string} question - Question à vectoriser
     * @returns {Promise<number[]>} Vecteur d'embedding
     */
    async generateEmbedding(question) {
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: question,
        });
        return embeddingRes.data[0].embedding;
    }

    /**
     * Génère une réponse avec GPT
     * @param {string} question - Question utilisateur
     * @param {string} context - Contexte récupéré
     * @returns {Promise<string>} Réponse générée
     */
    async generateAnswer(question, context) {
        const prompt = `Tu es un assistant IA spécialisé dans la recherche documentaire.

            Contexte disponible :
            ${context}

            Question : "${question}"

            Instructions :
            - Réponds uniquement en te basant sur le contexte fourni
            - Si le contexte ne contient pas d'informations pertinentes, dis-le clairement
            - Sois précis et factuel
            - N'invente pas d'informations`;

        const gptRes = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        });

        return gptRes.choices[0].message.content;
    }

    /**
     * Vérifie si la question est une salutation
     * @param {string} question - Question à vérifier
     * @returns {boolean} True si c'est une salutation
     */
    isGreeting(question) {
        const greetings = ['salut', 'bonjour', 'hello', 'coucou'];
        return greetings.includes(question.toLowerCase().trim());
    }

    /**
     * Construit le contexte à partir des résultats de recherche
     * @param {Array} searchResults - Résultats de recherche
     * @returns {string} Contexte formaté
     */
    buildContext(searchResults) {
        return searchResults.map(hit => hit.payload.text).join('\n---\n');
    }

    /**
     * Formate les sources pour l'affichage
     * @param {Array} searchResults - Résultats de recherche
     * @returns {Array} Sources formatées et déduplication
     */
    formatSources(searchResults) {
        const uniqueSources = new Map();
        
        searchResults.forEach(hit => {
            const key = `${hit.payload.title}-${hit.payload.author}`;
            if (!uniqueSources.has(key)) {
                uniqueSources.set(key, {
                    title: hit.payload.title,
                    author: hit.payload.author,
                    date: hit.payload.date,
                    score: Math.round(hit.score * 100)
                });
            }
        });

        return Array.from(uniqueSources.values())
            .filter(src => src.title && src.author && src.date);
    }
}

export const ragService = new RAGService();
