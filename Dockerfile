 FROM node:15-alpine
 WORKDIR /cultivate_bot
 COPY . .
 RUN yarn install --production
 CMD ["node", "game.js"]