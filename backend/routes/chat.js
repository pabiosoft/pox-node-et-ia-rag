import express from 'express';
import { ragService } from '../services/rag.js';

const router = express.Router();

/**
 * Route POST /ask - Traite les questions utilisateur
 */
router.post('/ask', async (req, res) => {
    try {
        const { question } = req.body;

        // Validation de base
        if (!question || question.length > 1000) {
            return res.status(400).json({ 
                error: 'Question invalide ou trop longue' 
            });
        }

        // Traitement avec le service RAG
        const result = await ragService.processQuestion(question);
        
        res.json(result);

    } catch (error) {
        console.error('❌ Erreur dans /ask:', error.message);
        res.status(500).json({ 
            error: 'Erreur serveur: problème avec l\'API OpenAI' 
        });
    }
});

export default router;
