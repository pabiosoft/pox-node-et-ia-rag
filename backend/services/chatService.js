/**
 * Service de chat principal avec intégration RAG et API Explorer
 */

import { apiExplorer } from './apiExplorer.js';
import { apiStorage } from './apiStorage.js';
import { ragService } from './ragService.js';

class ChatService {
    constructor() {
        this.apiContext = new Map(); // Contexte pour les conversations sur les API
        this.userSessions = new Map(); // Sessions utilisateur
    }

    /**
     * Traite un message utilisateur
     */
    async handleMessage(message, userId = 'default') {
        try {
            // 1. Vérifier si nous sommes déjà dans un contexte d'exploration d'API
            // Utiliser uniquement le stockage persistant (pas de contexte en mémoire)
            let session = await apiStorage.getSession(userId);
            let inApiContext = false;
            let currentContext = null;

            // Si nous avons une session active dans le stockage, l'utiliser
            if (session) {
                inApiContext = true;
                currentContext = {
                    apiUrl: session.apiUrl,
                    explorationTime: new Date(session.startedAt)
                };
            }

            let response;

            if (inApiContext) {
                // Vérifier si l'utilisateur veut quitter le mode API
                if (this.wantsToQuitApiMode(message)) {
                    // Supprimer la session du stockage
                    await apiStorage.deleteSession(userId, currentContext.apiUrl);
                    response = {
                        response: `👋 J'ai quitté le mode exploration API. Vous pouvez maintenant poser des questions normales ou explorer une autre API.`,
                        type: 'api',
                        mode: 'normal',
                        context: null
                    };
                } else {
                    // Continuer en mode API
                    // Passer le contexte à la méthode de suivi
                    response = await this.handleApiFollowup(message, userId);
                    // Ajouter l'indicateur de mode
                    response.mode = 'api';
                    // Ajouter le contexte actuel
                    response.currentContext = currentContext;
                }
            } else {
                // 2. Vérifier si le message contient une URL d'API avec intention d'exploration
                const apiUrl = this.extractApiUrl(message);

                if (apiUrl) {
                    // Mode exploration d'API
                    response = await this.handleApiExploration(message, apiUrl, userId);
                    response.mode = 'api';
                    response.currentContext = {
                        apiUrl: apiUrl,
                        explorationTime: new Date()
                    };
                    
                    // Créer une session dans le stockage pour persister le contexte
                    await apiStorage.createOrUpdateSession(userId, apiUrl, {
                        exploredEndpoints: response.data?.endpoints.map(e => e.path) || []
                    });
                } else if (this.isSpecialCommand(message)) {
                    // 3. Vérifier les commandes spéciales même en mode normal
                    response = await this.handleSpecialCommand(message, userId);
                    response.mode = 'normal';
                    response.currentContext = null;
                } else {
                    // 4. Mode RAG normal
                    response = await this.handleRagQuery(message);
                    response.mode = 'normal';
                    response.currentContext = null;
                }
            }

            return response;

        } catch (error) {
            console.error('❌ Erreur traitement message:', error.message);
            return {
                response: `❌ Une erreur est survenue: ${error.message}`,
                type: 'error',
                mode: 'normal', // En cas d'erreur, revenir au mode normal
                currentContext: null
            };
        }
    }

    /**
     * Vérifie si l'utilisateur veut quitter le mode API
     */
    wantsToQuitApiMode(message) {
        const normalized = message.toLowerCase();
        return normalized.includes('quitte le mode api') ||
               normalized.includes('quitter le mode api') ||
               normalized.includes('reviens au chat normal') ||
               normalized.includes('revenir au chat normal') ||
               normalized.includes('mode normal') ||
               normalized.includes('arrête l\'exploration') ||
               normalized.includes('arrêter l\'exploration');
    }

    /**
     * Extrait une URL d'API d'un message
     */
    extractApiUrl(message) {
        // Normaliser le message
        const normalizedMessage = message.toLowerCase();

        // Mots clés indiquant une intention d'exploration d'API
        const apiKeywords = [
            'explore ', 'explorer ', 'analyse ', 'analyser ', 'teste ', 'tester ',
            'appelle ', 'appeler ', 'requête ', 'requêter ', 'interroge ', 'interroger ',
            'voir ', 'montrer ', 'affiche ', 'afficher ', 'découvre ', 'découvrir '
        ];

        // Vérifier si le message contient une intention d'exploration
        const hasApiIntent = apiKeywords.some(keyword => 
            normalizedMessage.includes(keyword)
        );

        // Expression régulière pour détecter les URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const match = message.match(urlRegex);

        if (match && hasApiIntent) {
            const url = match[0];
            const normalizedUrl = url.endsWith('/') ? url : url + '/';

            // Vérifier les indicateurs d'API dans l'URL
            const apiIndicators = [
                '/api/', '/v1/', '/v2/', '/v3/', '/graphql', '/rest/',
                'api.', '.api.', 'jsonplaceholder', 'github', 'publicapis'
            ];

            const isApi = apiIndicators.some(indicator => 
                normalizedUrl.includes(indicator)
            ) || normalizedMessage.includes('api');

            if (isApi) {
                return normalizedUrl;
            }
        }

        // Vérification supplémentaire pour les messages très explicites
        if (normalizedMessage.includes('explore cette api') ||
            normalizedMessage.includes('explorer cette api') ||
            normalizedMessage.includes('analyse cette api')) {
            
            const urlMatch = message.match(urlRegex);
            if (urlMatch) {
                return urlMatch[0].endsWith('/') ? urlMatch[0] : urlMatch[0] + '/';
            }
        }

        return null;
    }

    /**
     * Gère l'exploration initiale d'une API
     */
    async handleApiExploration(message, apiUrl, userId) {
        try {
            // Initialiser le contexte API pour cet utilisateur
            this.apiContext.set(userId, {
                apiUrl,
                explorationTime: new Date(),
                currentEndpoint: null,
                favoriteId: null
            });

            // Explorer l'API
            const apiInfo = await apiExplorer.exploreApi(apiUrl, userId);

            // Générer une réponse formatée
            return this.formatApiExplorationResponse(apiInfo, apiUrl);

        } catch (error) {
            this.apiContext.delete(userId);
            return {
                response: `❌ Impossible d'explorer l'API: ${error.message}`,
                type: 'error'
            };
        }
    }

    /**
     * Formate la réponse pour l'exploration d'API
     */
    formatApiExplorationResponse(apiInfo, apiUrl) {
        if (!apiInfo.endpoints.length) {
            return {
                response: `🔍 J'ai exploré l'API à l'adresse **${apiUrl}** mais je n'ai pas trouvé d'endpoints accessibles ou de documentation.\n\n` +
                         `Vous pouvez essayer:\n` +
                         `- "Explore https://jsonplaceholder.typicode.com" pour tester avec une API publique\n` +
                         `- "Ajoute cette API aux favoris" pour la sauvegarder avec des headers personnalisés`,
                type: 'api',
                context: 'exploration'
            };
        }

        let response = `🌐 J'ai exploré l'API à l'adresse **${apiUrl}** et trouvé ${apiInfo.endpoints.length} endpoints accessibles:\n\n`;

        // Afficher les endpoints trouvés
        apiInfo.endpoints.slice(0, 10).forEach((endpoint, index) => { // Limiter à 10 pour éviter les messages trop longs
            response += `${index + 1}. **${endpoint.method} ${endpoint.path}**\n`;
            response += `   ${endpoint.description}\n`;
            if (endpoint.status) {
                response += `   📊 Statut: ${endpoint.status} (${endpoint.responseTime || 'N/A'}ms)\n`;
            }
            if (endpoint.sampleResponse) {
                response += `   📦 Exemple: \`${JSON.stringify(endpoint.sampleResponse)}\`\n`;
            }
            response += '\n';
        });

        if (apiInfo.endpoints.length > 10) {
            response += `... et ${apiInfo.endpoints.length - 10} autres endpoints\n\n`;
        }

        response += `💡 **Commandes disponibles**:\n`;
        response += `- "Appelle l'endpoint 1" (ou tout autre numéro)\n`;
        response += `- "Appelle /users" (ou tout autre chemin)\n`;
        response += `- "Ajoute cette API aux favoris"\n`;
        response += `- "Montre la documentation"\n`;
        response += `- "Quitte le mode API" pour revenir au chat normal\n`;

        return {
            response,
            type: 'api',
            context: 'exploration',
            data: {
                apiUrl,
                endpoints: apiInfo.endpoints
            }
        };
    }

    /**
     * Gère les questions de suivi sur une API
     */
    async handleApiFollowup(message, userId) {
        // Récupérer la session depuis le stockage
        const session = await apiStorage.getSession(userId);
        console.log(`[DEBUG] Session pour ${userId}:`, session); // Log de débogage
        if (!session) {
            return {
                response: `❌ Aucune session API active. Utilisez "Explore [URL]" pour commencer une nouvelle exploration.`,
                type: 'error',
                mode: 'normal'
            };
        }
        
        const apiUrl = session.apiUrl;
        const normalizedMessage = message.toLowerCase();

        // Commandes spéciales pour le mode API
        if (normalizedMessage.includes('quitte le mode api') || 
            normalizedMessage.includes('reviens au chat normal')) {
            
            this.apiContext.delete(userId);
            return {
                response: `👋 J'ai quitté le mode exploration API. Vous pouvez maintenant poser des questions normales ou explorer une autre API.`,
                type: 'api'
            };
        }

        if (normalizedMessage.includes('montre la documentation')) {
            try {
                const apiInfo = await apiExplorer.exploreApi(apiUrl, userId);
                const documentation = apiExplorer.generateApiDocumentation(apiInfo);
                
                return {
                    response: `Voici la documentation de l'API:\n\n\`\`\`markdown\n${documentation}\n\`\`\``,
                    type: 'api'
                };
            } catch (error) {
                return {
                    response: `❌ Impossible de générer la documentation: ${error.message}`,
                    type: 'error'
                };
            }
        }

        if (normalizedMessage.includes('ajoute cette api aux favoris') ||
            normalizedMessage.includes('ajoute aux favoris')) {
            
            return this.handleAddToFavorites(userId, apiUrl);
        }

        if (normalizedMessage.includes('mes favoris') ||
            normalizedMessage.includes('liste des favoris')) {
            
            return this.handleListFavorites(userId);
        }

        if (normalizedMessage.includes('mon historique') ||
            normalizedMessage.includes('historique des appels')) {
            
            return this.handleShowHistory(userId);
        }

        // Questions générales sur les endpoints
        if (normalizedMessage.includes('endpoint') || 
            normalizedMessage.includes('quels endpoints') ||
            normalizedMessage.includes('quels sont les endpoints') ||
            normalizedMessage.includes('liste des endpoints') ||
            normalizedMessage.includes('quels points de terminaison') ||
            normalizedMessage.includes('quels sont les points') ||
            normalizedMessage.includes('disponibles')) {
            
            try {
                const apiInfo = await apiExplorer.exploreApi(apiUrl, userId);
                
                let response = `📋 **Endpoints disponibles pour ${apiUrl}**:\n\n`;
                
                apiInfo.endpoints.forEach((endpoint, index) => {
                    response += `${index + 1}. **${endpoint.method} ${endpoint.path}**\n`;
                    response += `   ${endpoint.description}\n`;
                    if (endpoint.status) {
                        response += `   📊 Statut: ${endpoint.status}\n`;
                    }
                    response += '\n';
                });

                response += `💡 Vous pouvez appeler un endpoint spécifique avec:\n`;
                response += `- "Appelle l'endpoint 1" (ou tout autre numéro)\n`;
                response += `- "Appelle /users" (ou tout autre chemin)`;

                return {
                    response,
                    type: 'api'
                };
            } catch (error) {
                return {
                    response: `❌ Impossible de lister les endpoints: ${error.message}`,
                    type: 'error'
                };
            }
        }

        // Détection d'appel d'endpoint
        const endpointMatch = message.match(/appel(?:le)?\s+(?:l'?endpoint\s+)?(\d+|\/[^\s]+)/i);
        const callMatch = message.match(/(?:appel|requête|montre|affiche)\s+(?:l'?endpoint\s+)?(\d+|\/[^\s]+)/i);

        if (endpointMatch || callMatch) {
            const endpointIdentifier = (endpointMatch || callMatch)[1];
            return this.handleEndpointCall(userId, apiUrl, endpointIdentifier);
        }

        // Autres types de questions sur l'API
        return {
            response: `🤖 Je suis en mode exploration de l'API **${apiUrl}**.\n\n` +
                     `**Commandes disponibles**:\n` +
                     `- "Appelle l'endpoint 1" (ou un numéro)\n` +
                     `- "Appelle /users" (ou un chemin)\n` +
                     `- "Quels endpoints sont disponibles?"\n` +
                     `- "Ajoute cette API aux favoris"\n` +
                     `- "Montre la documentation"\n` +
                     `- "Mes favoris" pour voir vos APIs sauvegardées\n` +
                     `- "Mon historique" pour voir vos appels précédents\n` +
                     `- "Quitte le mode API" pour revenir au chat normal`,
            type: 'api'
        };
    }

    /**
     * Gère l'ajout d'une API aux favoris
     */
    async handleAddToFavorites(userId, apiUrl) {
        try {
            const favorite = await apiExplorer.addToFavorites(userId, {
                url: apiUrl,
                name: `API ${new Date().toLocaleDateString()}`,
                description: `Explorée le ${new Date().toLocaleString()}`
            });

            // Mettre à jour le contexte avec le favoriteId
            const context = this.apiContext.get(userId);
            context.favoriteId = favorite.id;
            this.apiContext.set(userId, context);

            return {
                response: `⭐ API ajoutée aux favoris avec succès!\n\n` +
                         `Vous pouvez maintenant:\n` +
                         `- Ajouter des headers personnalisés (comme les clés d'API)\n` +
                         `- Consulter "Mes favoris" pour voir toutes vos APIs sauvegardées\n` +
                         `- Utiliser "Appelle l'endpoint X" pour tester les endpoints`,
                type: 'api',
                favoriteId: favorite.id
            };
        } catch (error) {
            return {
                response: `❌ Impossible d'ajouter aux favoris: ${error.message}`,
                type: 'error'
            };
        }
    }

    /**
     * Gère la liste des favoris
     */
    async handleListFavorites(userId) {
        try {
            const favorites = await apiExplorer.getUserFavorites(userId);

            if (favorites.length === 0) {
                return {
                    response: `🔖 Vous n'avez pas encore d'APIs favorites. Explorez une API et utilisez "Ajoute aux favoris" pour en sauvegarder une.`,
                    type: 'api'
                };
            }

            let response = `🔖 **Vos APIs favorites** (${favorites.length}):\n\n`;

            favorites.forEach((fav, index) => {
                response += `${index + 1}. **${fav.name}**\n`;
                response += `   🔗 ${fav.url}\n`;
                response += `   📝 ${fav.description}\n`;
                response += `   📅 Dernière utilisation: ${new Date(fav.lastUsed).toLocaleString()}\n\n`;
            });

            response += `💡 Vous pouvez:\n`;
            response += `- "Explore [URL]" pour explorer une nouvelle API\n`;
            response += `- "Supprime le favori X" pour supprimer un favori\n`;

            return {
                response,
                type: 'api',
                favorites
            };
        } catch (error) {
            return {
                response: `❌ Impossible de récupérer les favoris: ${error.message}`,
                type: 'error'
            };
        }
    }

    /**
     * Gère l'affichage de l'historique
     */
    async handleShowHistory(userId) {
        try {
            const history = await apiExplorer.getUserHistory(userId, 10);

            if (history.length === 0) {
                return {
                    response: `📜 Votre historique d'appels API est vide. Explorez une API et appelez des endpoints pour commencer.`,
                    type: 'api'
                };
            }

            let response = `📜 **Votre historique d'appels API** (${history.length} derniers):\n\n`;

            history.forEach((entry, index) => {
                const date = new Date(entry.timestamp);
                response += `${index + 1}. **${entry.method} ${entry.endpoint}**\n`;
                response += `   🕒 ${date.toLocaleString()} (${entry.duration}ms)\n`;
                response += `   📊 Statut: ${entry.status}\n`;
                if (entry.status < 400) {
                    response += `   📦 Réponse: ${JSON.stringify(entry.response.data).substring(0, 100)}...\n`;
                } else {
                    response += `   ❌ Erreur: ${entry.response.error}\n`;
                }
                response += '\n';
            });

            response += `💡 Vous pouvez:\n`;
            response += `- "Efface mon historique" pour tout supprimer\n`;
            response += `- Continuer à explorer des APIs`;

            return {
                response,
                type: 'api',
                history
            };
        } catch (error) {
            return {
                response: `❌ Impossible de récupérer l'historique: ${error.message}`,
                type: 'error'
            };
        }
    }

    /**
     * Gère l'appel à un endpoint spécifique
     */
    async handleEndpointCall(userId, apiUrl, endpointIdentifier) {
        try {
            const context = this.apiContext.get(userId);
            const apiInfo = await apiExplorer.exploreApi(apiUrl, userId);
            let endpoint;

            if (!isNaN(endpointIdentifier)) {
                // C'est un numéro d'endpoint
                const index = parseInt(endpointIdentifier) - 1;
                endpoint = apiInfo.endpoints[index];
            } else {
                // C'est un chemin d'endpoint
                endpoint = apiInfo.endpoints.find(e => 
                    e.path.toLowerCase() === endpointIdentifier.toLowerCase()
                );
            }

            if (!endpoint) {
                return {
                    response: `❌ Je n'ai pas trouvé l'endpoint ${endpointIdentifier}. Voici les endpoints disponibles:\n\n` +
                             apiInfo.endpoints.map((e, i) => `${i+1}. ${e.method} ${e.path}`).join('\n'),
                    type: 'api'
                };
            }

            // Mettre à jour le contexte
            context.currentEndpoint = endpoint.path;
            this.apiContext.set(userId, context);

            // Appeler l'endpoint
            const result = await apiExplorer.callEndpoint(
                apiUrl, 
                endpoint.path, 
                {
                    method: endpoint.method,
                    userId: userId,
                    favoriteId: context.favoriteId
                }
            );

            // Formater la réponse
            return this.formatEndpointCallResponse(endpoint, result);

        } catch (error) {
            return {
                response: `❌ Erreur lors de l'appel à l'endpoint: ${error.message}`,
                type: 'error'
            };
        }
    }

    /**
     * Formate la réponse d'un appel d'endpoint
     */
    formatEndpointCallResponse(endpoint, result) {
        if (result.error) {
            return {
                response: `❌ L'appel à **${endpoint.method} ${endpoint.path}** a échoué:\n` +
                         `📊 Statut: ${result.status}\n` +
                         `💥 Erreur: ${result.error}\n\n` +
                         `💡 Vous pouvez essayer un autre endpoint ou vérifier si l'API nécessite une authentification.`,
                type: 'api'
            };
        }

        let response = `📡 **Résultat de ${endpoint.method} ${endpoint.path}**\n\n`;
        response += `🕒 Temps de réponse: ${result.duration}ms\n`;
        response += `📊 **Statut**: ${result.status}\n\n`;

        if (result.headers['content-type']) {
            response += `📦 **Type**: ${result.headers['content-type']}\n\n`;
        }

        response += `📄 **Données**:\n\`\`\`json\n`;
        response += `${JSON.stringify(result.data, null, 2)}\n`;
        response += '\`\`\`\n';

        if (result.rawData !== result.data) {
            response += `ℹ️ *Les données ont été tronquées pour une meilleure lisibilité.*\n`;
        }

        response += `\n🔄 **Prochaines étapes**:\n`;
        response += `- "Appelle l'endpoint X" pour tester un autre endpoint\n`;
        response += `- "Ajoute cette API aux favoris" pour la sauvegarder\n`;
        response += `- "Montre la documentation" pour plus de détails\n`;
        response += `- "Quitte le mode API" pour revenir au chat normal`;

        return {
            response,
            type: 'api',
            data: result.rawData
        };
    }

    /**
     * Vérifie si un message est une commande spéciale
     */
    isSpecialCommand(message) {
        const commands = [
            'mes favoris',
            'liste des favoris',
            'mon historique',
            'historique des appels',
            'efface mon historique',
            'supprime le favori',
            'ajoute un domaine',
            'quitte le mode api'
        ];

        return commands.some(cmd => message.toLowerCase().includes(cmd));
    }

    /**
     * Gère les commandes spéciales
     */
    async handleSpecialCommand(message, userId) {
        if (message.toLowerCase().includes('efface mon historique')) {
            const success = await apiExplorer.clearUserHistory(userId);
            return {
                response: success 
                    ? `🗑️ Votre historique a été effacé avec succès.`
                    : `❌ Impossible d'effacer l'historique.`,
                type: 'api'
            };
        }

        if (message.toLowerCase().match(/supprime\s+le\s+favori\s+(\d+)/i)) {
            const match = message.match(/supprime\s+le\s+favori\s+(\d+)/i);
            const index = parseInt(match[1]) - 1;
            
            const favorites = await apiExplorer.getUserFavorites(userId);
            if (favorites[index]) {
                const success = await apiExplorer.removeFavorite(favorites[index].id);
                return {
                    response: success 
                        ? `🗑️ Le favori "${favorites[index].name}" a été supprimé.`
                        : `❌ Impossible de supprimer le favori.`,
                    type: 'api'
                };
            }
        }

        if (message.toLowerCase().match(/ajoute\s+le\s+domaine\s+([^\s]+)/i)) {
            const match = message.match(/ajoute\s+le\s+domaine\s+([^\s]+)/i);
            const domain = match[1];
            
            apiExplorer.addAllowedDomain(domain);
            return {
                response: `✅ Le domaine **${domain}** a été ajouté à la liste des domaines autorisés.`,
                type: 'api'
            };
        }

        return {
            response: `ℹ️ Commande non reconnue. Essayez "Mes favoris" ou "Mon historique".`,
            type: 'api'
        };
    }

    /**
     * Gère les requêtes RAG normales
     */
    async handleRagQuery(message) {
        try {
            // Logique RAG existante - à adapter selon votre implémentation
            const result = await ragService.query(message);
            
            return {
                response: result.response,
                type: 'rag',
                sources: result.sources || []
            };
        } catch (error) {
            console.error('❌ Erreur RAG:', error.message);
            return {
                response: `❌ Impossible de traiter votre demande: ${error.message}`,
                type: 'error'
            };
        }
    }

    /**
     * Récupère le contexte actuel d'un utilisateur
     */
    getUserContext(userId) {
        return this.apiContext.get(userId) || null;
    }

    /**
     * Nettoie les contextes inactifs
     */
    async cleanupInactiveContexts() {
        const now = Date.now();
        const activeContexts = new Map();

        for (const [userId, context] of this.apiContext) {
            const contextTime = new Date(context.explorationTime);
            const hoursOld = (now - contextTime) / (1000 * 60 * 60);

            if (hoursOld < 2) { // Garder 2 heures
                activeContexts.set(userId, context);
            }
        }

        this.apiContext = activeContexts;
        return activeContexts.size;
    }
}

const chatService = new ChatService();

// Nettoyer périodiquement les contextes inactifs
setInterval(() => {
    chatService.cleanupInactiveContexts().catch(console.error);
}, 3600000); // Toutes les heures

export { chatService };