FROM node:20-alpine
ENV NODE_ENV=production PORT=3000 DATA_DIR=/var/lib/craftcrew
WORKDIR /app
# Runtime dependencies (only `pg`), installed exactly as locked
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js store.js store-postgres.js mailer.js sourcing.js compliance.js team.js documents.js planning.js xrechnung.js vies.js geo.js pdf.js acceptance.js punchlist.js sitereports.js calendar.js twofactor.js preferred.js requests.js servicepackages.js organigram.js sitecontent.js commission.js cockpit.js payments.js payouts.js clause.js estimate.js calibration.js pricerules.js capacity.js servedarea.js ranking.js demo-brokered.js benchmarks.js gdpr.js locales.js ./
COPY db ./db
# The database tools (migrate, import, export), run with `docker compose run --rm craftcrew node tools/db/…`
COPY tools/db ./tools/db
COPY migrations ./migrations
COPY public ./public
RUN mkdir -p /var/lib/craftcrew/uploads && chown -R node:node /app /var/lib/craftcrew
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
