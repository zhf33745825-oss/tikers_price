FROM node:20-bookworm-slim AS base
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:./data/app.db

COPY package*.json ./
RUN npm ci

COPY . .
RUN mkdir -p /app/data
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start"]
