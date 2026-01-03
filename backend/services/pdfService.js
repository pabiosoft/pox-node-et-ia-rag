/**
 * Service pour l'extraction de texte à partir de fichiers PDF
 * Utilise pdfjs-dist (version legacy) pour extraire le contenu textuel
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

// Import spécifique pour Node.js (version legacy)
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const CORPUS_DIR = path.resolve('./corpus');
const PDF_DIR = path.join(CORPUS_DIR, 'pdf');

export class PDFService {
    constructor() {
        this.ensurePdfDir();
    }

    /**
     * Retourne le chemin du dossier PDF
     * @returns {string} Chemin du dossier PDF
     */
    getPdfDir() {
        return PDF_DIR;
    }

    /**
     * Crée le dossier PDF s'il n'existe pas
     */
    ensurePdfDir() {
        if (!fs.existsSync(PDF_DIR)) {
            fs.mkdirSync(PDF_DIR, { recursive: true });
            console.log(`📁 Dossier PDF créé: ${PDF_DIR}`);
        }
    }

    /**
     * Extrait le texte d'un fichier PDF
     * @param {string} filePath - Chemin vers le fichier PDF
     * @returns {Promise<string>} Texte extrait
     */
    async extractTextFromPDF(filePath) {
        try {
            // 1. Lire le fichier
            const dataBuffer = await fsPromises.readFile(filePath);
            
            // 2. Vérifier si c'est un vrai PDF binaire ou du texte
            // Les vrais PDF commencent par %PDF-
            const header = dataBuffer.subarray(0, 5).toString();
            
            if (header.startsWith('%PDF-')) {
                // C'est un vrai PDF binaire
                const uint8Array = new Uint8Array(dataBuffer);
                
                // 3. Charger le document PDF
                const loadingTask = getDocument({ data: uint8Array });
                const pdfDocument = await loadingTask.promise;

                let fullText = '';

                // 4. Extraire le texte de chaque page
                for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
                    const page = await pdfDocument.getPage(pageNum);
                    const textContent = await page.getTextContent();

                    // Concaténer les éléments de texte de la page
                    const pageText = textContent.items
                        .map(item => item.str)
                        .join(' ');

                    fullText += pageText + '\n';
                }

                if (!fullText.trim()) {
                    throw new Error('Aucun texte trouvé dans le PDF');
                }

                return fullText.trim();
            } else {
                // Ce n'est pas un vrai PDF, c'est probablement du texte simple
                // Lire comme texte UTF-8
                return dataBuffer.toString('utf-8').trim();
            }

        } catch (error) {
            console.error(`❌ Erreur extraction PDF ${filePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Génère un document à partir d'un PDF
     * @param {string} filePath - Chemin vers le fichier PDF
     * @param {string} fileName - Nom du fichier original
     * @returns {Promise<Object>} Document structuré
     */
    async generateDocumentFromPDF(filePath, fileName) {
        try {
            const text = await this.extractTextFromPDF(filePath);
            const now = new Date();
            const date = now.toISOString().split('T')[0];

            return {
                title: `PDF: ${path.parse(fileName).name}`,
                author: "saidou",
                date: date,
                category: "PDF",
                text: text
            };

        } catch (error) {
            console.error(`❌ Erreur génération document PDF ${fileName}:`, error.message);
            throw error;
        }
    }

    /**
     * Liste les fichiers PDF disponibles
     * @returns {Promise<Array>} Liste des fichiers PDF
     */
    async listPDFFiles() {
        try {
            if (!fs.existsSync(PDF_DIR)) return [];
            
            const files = await fsPromises.readdir(PDF_DIR);
            return files
                .filter(file => file.toLowerCase().endsWith('.pdf'))
                .sort();
        } catch {
            return [];
        }
    }

    /**
     * Charge et indexe tous les PDF du dossier
     * @returns {Promise<Array>} Liste des documents générés
     */
    async loadAndIndexAllPDFs() {
        const files = await this.listPDFFiles();
        const documents = [];

        for (const file of files) {
            try {
                const filePath = path.join(PDF_DIR, file);
                const document = await this.generateDocumentFromPDF(filePath, file);
                documents.push(document);
                console.log(`✅ PDF traité: ${file}`);
            } catch (error) {
                console.error(`❌ Échec traitement ${file}:`, error.message);
            }
        }

        return documents;
    }

    /**
     * Traite un fichier PDF spécifique
     * @param {string} fileName - Nom du fichier PDF
     * @returns {Promise<Object>} Document généré
     */
    async processSpecificPDF(fileName) {
        try {
            const filePath = path.join(PDF_DIR, fileName);
            
            // Vérifier si le fichier existe
            if (!fs.existsSync(filePath)) {
                throw new Error(`Fichier non trouvé: ${fileName}`);
            }

            const document = await this.generateDocumentFromPDF(filePath, fileName);
            console.log(`✅ PDF traité: ${fileName}`);
            
            return document;

        } catch (error) {
            console.error(`❌ Échec traitement ${fileName}:`, error.message);
            throw error;
        }
    }

    /**
     * Vérifie si un fichier PDF a déjà été indexé
     */
    async isPDFAlreadyIndexed(fileName) {
        return false;
    }
}

export const pdfService = new PDFService();