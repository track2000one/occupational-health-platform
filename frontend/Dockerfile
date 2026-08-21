FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV NODE_ENV=production

RUN npx vite build

EXPOSE 8080

CMD ["sh", "-c", "npx vite preview --host 0.0.0.0 --port ${PORT:-8080}"]
