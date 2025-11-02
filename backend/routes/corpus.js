import express from 'express';
import multer from 'multer';
import { corpusService } from '../services/corpus.js';
import { indexerService } from '../services/indexer.js';

const router = express.Router();

/**
 * Route GET /corpus - Liste les fichiers Excel disponibles
 */
router.get('/corpus', async (_, res) => {
    try {
        const files = await corpusService.listExcelFiles();
        const items = files.map(name => ({
            name,
            url: `/corpus/excel/${encodeURIComponent(name)}`,
        }));
        res.json({ files: items });
    } catch (error) {
        console.error('❌ Erreur dans GET /corpus:', error.message);
        res.status(500).json({
            error: 'Erreur serveur: impossible de lister les fichiers Excel',
        });
    }
});

const upload = multer({
    storage: multer.diskStorage({
        destination: async (_, __, callback) => {
            try {
                await corpusService.ensureExcelDir();
                callback(null, corpusService.getExcelDir());
            } catch (error) {
                callback(error);
            }
        },
        filename: (_, file, callback) => {
            callback(null, file.originalname);
        }
    })
});

/**
 * Route POST /corpus/upload - Upload d'un fichier Excel
 */
router.post('/corpus/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier reçu' });
    }

    try {
        const summary = await indexerService.indexExcelFile(req.file.filename);

        res.status(201).json({
            message: 'Fichier reçu et indexé',
            file: {
                name: req.file.filename,
                url: `/corpus/excel/${encodeURIComponent(req.file.filename)}`,
            },
            indexed: summary.indexed,
        });
    } catch (error) {
        console.error('❌ Erreur lors de l\'indexation ponctuelle:', error.message);
        const status = error.statusCode || 500;
        res.status(status).json({
            error: status >= 500
                ? 'Erreur serveur: impossible d\'indexer le fichier'
                : error.message,
        });
    }
});

export default router;
