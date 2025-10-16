# === Base stage ===
FROM node:latest AS base
WORKDIR /usr/src/app
COPY package*.json ./

# === Development stage ===
FROM base AS dev
RUN npm install
COPY . .
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

# === Production stage ===
FROM base AS prod
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 5000
CMD ["npm", "start"]



