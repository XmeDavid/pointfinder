#!/bin/bash

# Initialize Let's Encrypt SSL certificates for dbvnfc.davidsbatista.com
# This script should be run once before starting the application

set -e

domains=(dbvnfc.davidsbatista.com)
rsa_key_size=4096
data_path="./certbot"
email="info@davidsbatista.com" # Replace with your email
staging=0 # Set to 1 for testing with Let's Encrypt staging server

echo "### Preparing directories..."
mkdir -p "$data_path/conf/live/$domains"
mkdir -p "$data_path/www"

if [ -d "$data_path/conf/live/$domains" ]; then
  echo "### Existing data found. Checking certificates..."
  if [ -f "$data_path/conf/live/$domains/cert.pem" ]; then
    echo "### Certificate already exists. Skipping creation."
    echo "### To renew certificates, run: docker compose run --rm certbot renew"
    exit 0
  fi
fi

echo "### Creating dummy certificate for $domains..."
path="/etc/letsencrypt/live/$domains"
docker compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1\
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot
echo

echo "### Starting nginx..."
docker compose up --force-recreate -d nginx
echo

echo "### Deleting dummy certificate for $domains..."
docker compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$domains && \
  rm -Rf /etc/letsencrypt/archive/$domains && \
  rm -Rf /etc/letsencrypt/renewal/$domains.conf" certbot
echo

echo "### Requesting Let's Encrypt certificate for $domains..."
# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    --email $email \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d $domains" certbot
echo

echo "### Reloading nginx..."
docker compose exec nginx nginx -s reload
echo

echo "### SSL certificates successfully installed!"
echo "### Your site is now available at https://$domains"
