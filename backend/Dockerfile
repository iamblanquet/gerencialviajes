FROM node:20-alpine

# Instalar dependencias para compilar módulos nativos como better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
