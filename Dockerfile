FROM node:20-alpine
ENV NODE_ENV=production PORT=3000 DATA_DIR=/var/lib/craftcrew
WORKDIR /app
COPY package.json server.js mailer.js ./
COPY public ./public
RUN mkdir -p /var/lib/craftcrew/uploads && chown -R node:node /app /var/lib/craftcrew
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
