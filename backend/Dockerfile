FROM node:24-alpine3.21

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

WORKDIR /app

# Installer nodemon globalement AVANT de changer d'utilisateur
RUN npm install -g nodemon

# Copier les fichiers de dépendances AVANT l'installation
COPY package*.json ./

# Installer les dépendances (nodemon sera installé avec les devDependencies)
RUN npm install --include=dev && npm cache clean --force

# Copier le code source
COPY . .

# Changer le propriétaire des fichiers
RUN chown -R nodeuser:nodejs /app

# Passer à l'utilisateur non-root
USER nodeuser

# Exposer le port
EXPOSE 3000

# Commande pour le développement
CMD ["npm", "run", "dev"]
