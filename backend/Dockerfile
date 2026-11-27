FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
# For `devspace dev`: its sync writes into /app as the container user (node), so node must
# own /app. Without DevSpace, /app would stay root-owned and read-only to the app.
RUN chown node:node /app
USER node
# --chown=node:node: same reason, so sync can overwrite these files
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server.js ./
EXPOSE 4000
CMD ["node", "server.js"]
