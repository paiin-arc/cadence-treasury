FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx typescript

COPY tsconfig.json ./
COPY src ./src

CMD ["npm", "start"]
