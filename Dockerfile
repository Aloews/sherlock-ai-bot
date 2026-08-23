FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl bash ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g vercel supabase pm2

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
