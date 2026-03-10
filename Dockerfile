FROM caddy:2-alpine
WORKDIR /srv
COPY . /srv
COPY Caddyfile /etc/caddy/Caddyfile
