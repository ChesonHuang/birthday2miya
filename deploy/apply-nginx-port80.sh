#!/usr/bin/env bash
# 把生日 H5 设为 http://公网IP/ （80 端口，免写端口号）
# 用法：bash deploy/apply-nginx-port80.sh
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/happybirthday-public-ip.conf"
DEST=/etc/nginx/sites-available/happybirthday-public-ip.conf
PA=/etc/nginx/sites-available/plantanswer-public-ip.conf

if [[ $EUID -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

cp "$SRC" "$DEST"
ln -sf "$DEST" /etc/nginx/sites-enabled/happybirthday-public-ip.conf

if [[ -f "$PA" ]]; then
  sed -i 's/listen 80 default_server;/listen 80;/' "$PA"
  sed -i 's/listen \[::\]:80 default_server;/listen [::]:80;/' "$PA"
fi

nginx -t
systemctl reload nginx
echo "已生效：本机用 http://127.0.0.1/ 或 http://192.168.1.5/ 验证"
echo "公网用 http://$(curl -4 -sS --max-time 5 https://ifconfig.me)/"
