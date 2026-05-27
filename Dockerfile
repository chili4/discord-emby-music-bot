FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json .
RUN npm install

COPY tsconfig.json .
COPY src/ src/

RUN npm run build

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package.json .
RUN npm install --omit=dev

COPY --from=builder /app/dist/ dist/

CMD ["node", "dist/index.js"]
