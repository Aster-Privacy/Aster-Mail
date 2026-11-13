FROM nginx:1.31.7-alpine@sha256:892bb2152464f0c5d8972593a5f5afaf8054552580b699d95f8ff4af08c2d33d

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

RUN mkdir -p /etc/nginx/secret && \
    printf 'map $is_onion $onion_auth_header { default ""; }\n' > /etc/nginx/secret/onion_secret_map.conf && \
    chown -R appuser:appgroup /etc/nginx/secret

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html

RUN find /usr/share/nginx/html -name '*.map' -type f -delete

RUN chown -R appuser:appgroup /usr/share/nginx/html

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
