/**
 * Service RAG simple pour la compatibilité
 * À remplacer par votre implémentation réelle
 */

class RagService {
    constructor() {
        console.log('🤖 Service RAG initialisé (implémentation basique)');
    }

    /**
     * Effectue une recherche RAG
     */
    async query(question) {
        // Vérifier si la question concerne les APIs
        const normalizedQuestion = question.toLowerCase();
        const isApiRelated = normalizedQuestion.includes('api') ||
                           normalizedQuestion.includes('endpoint') ||
                           normalizedQuestion.includes('explorer') ||
                           normalizedQuestion.includes('jsonplaceholder') ||
                           normalizedQuestion.includes('github') ||
                           normalizedQuestion.includes('publicapis');

        if (isApiRelated) {
            return {
                response: `Il semble que vous parliez d'APIs. Pour explorer une API, utilisez une phrase comme "Explore https://jsonplaceholder.typicode.com" ou "Analyse cette API: [URL]".`,
                sources: [],
                relevant: false,
                suggestion: 'api_exploration'
            };
        }

        // Implémentation basique - à remplacer par votre logique RAG réelle
        return {
            response: `Je ne peux pas répondre à cette question pour le moment. ` +
                     `Le système RAG n'est pas encore pleinement implémenté. ` +
                     `Vous pouvez essayer d'explorer une API avec une URL.`,
            sources: [],
            relevant: false
        };
    }
}

const ragService = new RagService();
export { ragService };