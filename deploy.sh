#!/bin/bash
set -e

# ============================================================
# TimeWin — VPS Deployment Script
# ============================================================
# Usage:
#   1. First deploy:  ./deploy.sh setup
#   2. Update app:    ./deploy.sh update
#   3. View logs:     ./deploy.sh logs
#   4. DB seed:       ./deploy.sh seed
#   5. DB backup:     ./deploy.sh backup
#   6. SSL cert:      ./deploy.sh ssl
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

COMPOSE="docker compose -f docker-compose.prod.yml"

log()   { echo -e "${GREEN}[TimeWin]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- Check prerequisites ----
check_deps() {
    command -v docker >/dev/null 2>&1 || error "Docker non installé. Installez-le: https://docs.docker.com/engine/install/"
    docker compose version >/dev/null 2>&1 || error "Docker Compose v2 non trouvé."
}

# ---- Load .env.production ----
load_env() {
    if [ ! -f .env.production ]; then
        error ".env.production introuvable. Copiez .env.example → .env.production et configurez les valeurs."
    fi
    set -a
    source .env.production
    set +a
    log "Variables d'environnement chargées depuis .env.production"
}

# ---- Configure nginx domain ----
configure_nginx() {
    if [ -z "$DOMAIN" ]; then
        error "Variable DOMAIN manquante dans .env.production"
    fi
    log "Configuration nginx pour: $DOMAIN"
    sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" nginx/conf.d/default.conf
}

# ---- Initial SSL (Let's Encrypt) ----
obtain_ssl() {
    if [ -z "$DOMAIN" ] || [ -z "$SSL_EMAIL" ]; then
        error "Variables DOMAIN et SSL_EMAIL requises dans .env.production"
    fi

    log "Obtention du certificat SSL pour $DOMAIN..."

    # Create a temporary HTTP-only nginx config for certbot challenge
    cp nginx/conf.d/default.conf nginx/conf.d/default.conf.bak

    cat > nginx/conf.d/default.conf << TMPEOF
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
TMPEOF

    # Start services
    $COMPOSE up -d postgres app nginx

    # Wait for nginx to be ready
    sleep 5

    # Obtain certificate
    docker compose -f docker-compose.prod.yml run --rm certbot \
        certbot certonly --webroot \
        -w /var/www/certbot \
        -d "$DOMAIN" \
        --email "$SSL_EMAIL" \
        --agree-tos \
        --no-eff-email \
        --force-renewal

    # Restore full nginx config with SSL
    cp nginx/conf.d/default.conf.bak nginx/conf.d/default.conf
    rm nginx/conf.d/default.conf.bak
    sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" nginx/conf.d/default.conf

    # Reload nginx with SSL config
    $COMPOSE restart nginx

    log "Certificat SSL obtenu avec succès!"
}

# ---- SETUP (first deploy) ----
cmd_setup() {
    log "============================================"
    log "  TimeWin — Premier déploiement"
    log "============================================"

    check_deps
    load_env

    # Configure domain in nginx
    configure_nginx

    # Build and start
    log "Build de l'image Docker..."
    $COMPOSE build app

    log "Démarrage de PostgreSQL..."
    $COMPOSE up -d postgres
    sleep 5

    log "Démarrage de l'application..."
    $COMPOSE up -d app

    # Wait for the app to be ready
    log "Attente du démarrage de l'app..."
    sleep 10

    # Run database migrations
    log "Migration de la base de données..."
    $COMPOSE exec app npx prisma db push || warn "Migration échouée, vérifiez les logs"

    log "Démarrage de nginx..."
    $COMPOSE up -d nginx

    echo ""
    log "============================================"
    log "  ✅ TimeWin est en ligne!"
    log "============================================"
    log ""
    log "  URL: http://$DOMAIN"
    log ""
    log "  Pour activer HTTPS:"
    log "    ./deploy.sh ssl"
    log ""
    log "  Pour seed la base de données:"
    log "    ./deploy.sh seed"
    log ""
    log "============================================"
}

# ---- UPDATE (redeploy) ----
cmd_update() {
    log "Mise à jour de TimeWin..."
    check_deps
    load_env

    log "Pull des dernières modifications..."
    git pull origin main 2>/dev/null || warn "Git pull échoué (pas grave si déploiement manuel)"

    log "Rebuild de l'image..."
    $COMPOSE build app

    log "Redémarrage de l'application..."
    $COMPOSE up -d app

    # Wait and run migrations
    sleep 10
    log "Migration de la base de données..."
    $COMPOSE exec app npx prisma db push || true

    $COMPOSE restart nginx 2>/dev/null || true

    log "✅ Mise à jour terminée!"
}

# ---- LOGS ----
cmd_logs() {
    $COMPOSE logs -f --tail=100 "${2:-app}"
}

# ---- SEED database ----
cmd_seed() {
    log "Seeding de la base de données..."
    load_env
    $COMPOSE exec app npx tsx prisma/seed.ts || warn "Seed échoué, vérifiez les logs"
    log "✅ Seed terminé!"
}

# ---- BACKUP database ----
cmd_backup() {
    load_env
    BACKUP_FILE="backup_timewin_$(date +%Y%m%d_%H%M%S).sql"
    log "Backup de la base de données → $BACKUP_FILE"
    $COMPOSE exec -T postgres pg_dump -U "${POSTGRES_USER:-timewin}" "${POSTGRES_DB:-timewin}" > "$BACKUP_FILE"
    log "✅ Backup créé: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
}

# ---- SSL certificate ----
cmd_ssl() {
    load_env
    obtain_ssl
}

# ---- STATUS ----
cmd_status() {
    $COMPOSE ps
}

# ---- STOP ----
cmd_stop() {
    log "Arrêt de tous les services..."
    $COMPOSE down
    log "✅ Services arrêtés"
}

# ---- RESTART ----
cmd_restart() {
    load_env
    log "Redémarrage des services..."
    $COMPOSE restart
    log "✅ Services redémarrés"
}

# ---- Main ----
case "${1:-}" in
    setup)   cmd_setup ;;
    update)  cmd_update ;;
    logs)    cmd_logs "$@" ;;
    seed)    cmd_seed ;;
    backup)  cmd_backup ;;
    ssl)     cmd_ssl ;;
    status)  cmd_status ;;
    stop)    cmd_stop ;;
    restart) cmd_restart ;;
    *)
        echo ""
        echo -e "${BLUE}TimeWin — Commandes de déploiement${NC}"
        echo ""
        echo "  ./deploy.sh setup     Premier déploiement (build + start + migrate)"
        echo "  ./deploy.sh update    Mise à jour (rebuild + restart + migrate)"
        echo "  ./deploy.sh ssl       Obtenir/renouveler le certificat SSL"
        echo "  ./deploy.sh logs      Voir les logs (app par défaut)"
        echo "  ./deploy.sh logs db   Voir les logs PostgreSQL"
        echo "  ./deploy.sh seed      Seed la base de données"
        echo "  ./deploy.sh backup    Backup de la base de données"
        echo "  ./deploy.sh status    État des services"
        echo "  ./deploy.sh restart   Redémarrer les services"
        echo "  ./deploy.sh stop      Arrêter tous les services"
        echo ""
        ;;
esac
