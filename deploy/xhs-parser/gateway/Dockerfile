FROM node:22-alpine
WORKDIR /app
COPY gateway.mjs ./gateway.mjs
USER node
EXPOSE 8788
CMD ["node", "gateway.mjs"]
