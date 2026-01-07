import { indexerService } from './services/indexer.js';

indexerService.reindexCorpus()
    .then(() => console.log('✅ Indexation terminée avec succès.'))
    .catch(error => {
        console.error('❌ Erreur globale:', error);
        process.exit(1);
    });
