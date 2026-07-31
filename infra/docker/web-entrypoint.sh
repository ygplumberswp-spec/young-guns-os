#!/bin/sh
# Runs via nginx image /docker-entrypoint.d before nginx starts.
# When API_PROXY_UPSTREAM is set, proxy /api/* same-origin and force the UI
# onto relative /api/v1 (overrides any baked VITE_API_BASE_URL).
set -eu

CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx/conf.d}"
CONF="${CONF_DIR}/default.conf"
HTML_ROOT="${TITAN_HTML_ROOT:-/usr/share/nginx/html}"
NOPROXY_SRC="${TITAN_NOPROXY_CONF:-/etc/nginx/noproxy.default.conf}"

# Remove auto-generated template output if present so we own default.conf.
rm -f "${CONF_DIR}/default.conf"

if [ -n "${API_PROXY_UPSTREAM:-}" ]; then
  UPSTREAM="${API_PROXY_UPSTREAM%/}"
  cat >"${CONF}" <<EOF
server {
  listen 8080;
  server_name _;
  root ${HTML_ROOT};
  index index.html;

  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy no-referrer always;

  location = /healthz {
    access_log off;
    default_type text/plain;
    return 200 'ok';
  }

  location = /runtime-config.js {
    access_log off;
    add_header Cache-Control "no-store";
    default_type application/javascript;
    return 200 'window.__TITAN_API_BASE__="";';
  }

  # Same-origin API proxy — browser never needs cross-origin CORS to the API service.
  location /api/ {
    proxy_pass ${UPSTREAM};
    proxy_http_version 1.1;
    proxy_ssl_server_name on;
    proxy_set_header Host \$proxy_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Cookie \$http_cookie;
    proxy_pass_request_headers on;
    # Upstream CORS/CORP headers are irrelevant (and harmful) on same-origin responses.
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Credentials;
    proxy_hide_header Access-Control-Allow-Headers;
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Cross-Origin-Resource-Policy;
    proxy_hide_header Vary;
  }

  location / {
    try_files \$uri \$uri/ /index.html;
  }

  location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)\$ {
    expires 7d;
    access_log off;
  }
}
EOF
  printf 'window.__TITAN_API_BASE__="";\n' >"${HTML_ROOT}/runtime-config.js"
  echo "titan-web: API proxy enabled → ${UPSTREAM} (same-origin /api)"
else
  cp "${NOPROXY_SRC}" "${CONF}"
  echo "titan-web: API_PROXY_UPSTREAM unset — serving static UI only (no /api proxy)"
fi
