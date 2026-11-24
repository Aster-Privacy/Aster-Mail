FROM nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown appuser:appgroup /var/run/nginx.pid

RUN sed -i 's|application/javascript\s*js;|application/javascript js mjs;|' /etc/nginx/mime.types

RUN sed -i 's|worker_connections  1024;|worker_connections  8192;|' /etc/nginx/nginx.conf && \
    sed -i 's|^worker_processes  auto;|worker_processes  auto;\nworker_rlimit_nofile 32768;|' /etc/nginx/nginx.conf && \
    grep -q 'worker_connections  8192;' /etc/nginx/nginx.conf && \
    grep -q '^worker_rlimit_nofile 32768;' /etc/nginx/nginx.conf

RUN grep -q webmanifest /etc/nginx/mime.types || \
    sed -i 's|application/json  *json;|application/json                       json;\n    application/manifest+json             webmanifest;|' /etc/nginx/mime.types

ENV NGINX_ENVSUBST_FILTER="^BACKEND_SERVICE_(HOST|PORT)$"

RUN rm -f /etc/nginx/conf.d/default.conf && \
    chown appuser:appgroup /etc/nginx/conf.d

COPY nginx_entrypoint/15_require_backend_env.envsh /docker-entrypoint.d/15_require_backend_env.envsh

RUN chmod 0755 /docker-entrypoint.d/15_require_backend_env.envsh

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chown=appuser:appgroup dist /usr/share/nginx/html

RUN find /usr/share/nginx/html -name '*.map' -type f -delete


USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
