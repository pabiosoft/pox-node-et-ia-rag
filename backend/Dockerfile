FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# nodemon sera utilisé uniquement en dev
CMD ["npm", "run", "dev"]
