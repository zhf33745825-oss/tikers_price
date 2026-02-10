FROM node:24-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN mkdir -p /app/data
RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start"]
