# Build stage
FROM dockerhub.rnd.amadeus.net/registry-1-docker-io-remote/node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Production stage — Amadeus RHEL base with nginx
FROM docker-release.nce.dockerhub.rnd.amadeus.net/acs/rhel-init

# Labels (Forge best practice)
LABEL maintainer="enzomar@gmail.com" \
      org.label-schema.name="toki" \
      org.label-schema.description="Token Cost Calculator for Agentic AI Systems" \
      org.label-schema.vendor="Amadeus" \
      org.label-schema.vcs-url="https://rndwww.nce.amadeus.net/git/projects/TOKI"

# Install nginx
RUN dnf install -y nginx && \
    dnf clean all && \
    rm -rf /var/cache/dnf

# Copy built static assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create non-root user (OpenShift SCC compliance)
RUN groupadd -g 1000 app && \
    useradd -g app -u 1000 app && \
    chown -R app:app /usr/share/nginx/html && \
    chown -R app:app /var/log/nginx && \
    mkdir -p /var/run/nginx && \
    chown -R app:app /var/run/nginx && \
    chmod -R g+rwx /var/log/nginx /var/run/nginx

# Switch to non-root user
USER app

# Expose non-privileged port (required by OpenShift)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
