# 通过 Nginx 反向代理，用公网 IP 访问生日 H5

本项目是纯静态页面（`index.html` + `css/` + `js/`）。**免端口访问**走 HTTP 默认 80：

```
手机 / 浏览器
    →  http://<公网IP>/
    →  家宽路由器把 80 转到 192.168.1.5:80（或云安全组放行 80）
    →  本机 Nginx（default_server）
    →  127.0.0.1:18099 上的静态服务
```

一键切换（需输入 sudo 密码）：

```bash
cd /home/wong/MachineLearing/happybirthday
python3 -m http.server 18099 --bind 127.0.0.1 &
bash deploy/apply-nginx-port80.sh
```

之后地址就是 `http://<公网IP>/`，不用写端口。`hsbwxy.com` 仍指向 plantAnwser；用公网 IP 打开时会变成生日页。

## 0. 先看清本机现状

| 项目 | 现状 |
|------|------|
| 内网地址 | `192.168.1.5` |
| 免端口访问 | 必须占用 80 的 `default_server`（浏览器默认就是 80） |
| 域名站点 | `hsbwxy.com` 也在 80 上，按 Host 分流，互不影响 |

独立端口 / 路径前缀见下文方案一、方案二（仅在你不想占用 80 默认站时使用）。

---

## 方案一：独立端口反代（推荐）

### 1. 启动本机静态服务（只绑 127.0.0.1）

在项目根目录执行：

```bash
cd /home/wong/MachineLearing/happybirthday
python3 -m http.server 18099 --bind 127.0.0.1
```

`--bind 127.0.0.1` 表示外网不能直接打到 Python，必须经过 Nginx。

对外端口用 `8099`，对内端口用 `18099`，避免 Nginx 和 Python 抢同一个口。

本机先确认后端活着：

```bash
curl -I http://127.0.0.1:18099/
# 期望：HTTP/1.0 200 OK
```

需要后台常驻时，用 systemd（见文末附录），或先用：

```bash
nohup python3 -m http.server 18099 --bind 127.0.0.1 \
  >/tmp/happybirthday-h5.log 2>&1 &
```

### 2. 启用 Nginx 反代

配置文件已写好：`deploy/happybirthday-public-ip.conf`（对外 8099 → 对内 127.0.0.1:18099）。

安装并重载：

```bash
sudo cp /home/wong/MachineLearing/happybirthday/deploy/happybirthday-public-ip.conf \
    /etc/nginx/sites-available/happybirthday-public-ip.conf
sudo ln -sf /etc/nginx/sites-available/happybirthday-public-ip.conf \
    /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

本机验证 Nginx 是否通：

```bash
curl -I http://127.0.0.1:8099/
curl -I http://192.168.1.5:8099/
```

同一 Wi-Fi 下，手机浏览器打开 `http://192.168.1.5:8099/` 应能看到信封页。

### 3. 放行防火墙

Ubuntu 若开了 ufw：

```bash
sudo ufw allow 8099/tcp
sudo ufw status
```

云服务器还要在 **安全组** 入站放行 `TCP 8099`（阿里云 / 腾讯云 / AWS 控制台）。

### 4. 让「公网 IP」真正打到这台机器

本机现在只有局域网地址 `192.168.1.5`。外网要访问，必须再做一层。

**家用宽带（当前最可能）：**

1. 浏览器打开 [https://ip.sb](https://ip.sb) 或 `curl ifconfig.me` 查看公网 IP。
2. 登录光猫 / 路由器管理页，做 **端口转发（虚拟服务器）**：
   - 外网端口：`8099`
   - 内网 IP：`192.168.1.5`
   - 内网端口：`8099`
   - 协议：TCP
3. 运营商若是 **大内网 / CGNAT**（公网 IP 查到的和路由器 WAN 口不一致），家宽无法直接被访问，需要内网穿透（frp / nps / Cloudflare Tunnel）或换有公网 IP 的云主机。
4. 部分宽带会封 80，**8099 一般能过**，这也是用独立端口的原因之一。

**云主机：**

把弹性公网 IP 绑到这台机后，安全组放行 8099 即可，无需路由器转发。

### 5. 访问地址

```
http://<你的公网IP>:8099/
```

把链接发给对方即可。手机请用系统浏览器；微信内对「纯 IP + HTTP」有时会拦截，可提示用 Safari / Chrome 打开。

---

## 方案二：挂到现有 80，路径为 `/mia/`

不想开新端口、希望链接更短时用这个。现有 `http://公网IP/` 仍是 plantAnwser，生日页走：

```
http://<公网IP>/mia/
```

### 1. 同样先起静态服务

```bash
cd /home/wong/MachineLearing/happybirthday
python3 -m http.server 18099 --bind 127.0.0.1
```

### 2. 把路径块加进现有 80 站点

编辑 `/etc/nginx/sites-available/plantanswer-public-ip.conf`，在 `location /` **之前** 插入（参考 `deploy/happybirthday-path.conf`）：

```nginx
location = /mia {
    return 301 /mia/;
}

location /mia/ {
    proxy_pass http://127.0.0.1:18099/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
}
```

要点：

- `proxy_pass` 末尾的 **`/` 必须有**。这样 Nginx 会去掉 `/mia` 前缀，后端收到的是 `/`、`/css/style.css`，和页面里的相对路径一致。
- 这段必须写在 `location /` 前面，否则会被 `/` 吃掉。

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -I http://127.0.0.1/mia/
```

家宽若已经把路由器 **80 → 192.168.1.5:80** 转好，外网直接打开 `http://公网IP/mia/`。

---

## 方案三：不反代，Nginx 直接托管静态文件

没有「必须反代」时，这是最稳的。Nginx 自己读磁盘，不用再挂 Python。

```nginx
server {
    listen 8099;
    listen [::]:8099;
    server_name _;

    root /home/wong/MachineLearing/happybirthday;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

注意目录权限：`www-data` 要能进入每一层路径。若 403，执行：

```bash
chmod o+x /home/wong /home/wong/MachineLearing /home/wong/MachineLearing/happybirthday
```

更稳妥是拷到 `/var/www`：

```bash
sudo mkdir -p /var/www/happybirthday
sudo cp -a /home/wong/MachineLearing/happybirthday/. /var/www/happybirthday/
sudo chown -R www-data:www-data /var/www/happybirthday
```

然后把 `root` 改成 `/var/www/happybirthday`。

---

## 验证清单

按顺序做，哪一步失败就停在哪一步，不要跳到公网。

| 步骤 | 命令 / 操作 | 期望 |
|------|-------------|------|
| 后端 | `curl -I http://127.0.0.1:18099/` | 200 |
| Nginx | `sudo nginx -t` | syntax is ok |
| 本机反代 | `curl -I http://127.0.0.1:8099/` 或 `/mia/` | 200，且 `Server: nginx` |
| 局域网 | 手机连同一 Wi-Fi，打开内网 URL | 能看到信封 |
| 防火墙 | `sudo ss -tlnp \| grep 8099` | nginx 在听 |
| 公网 | 用 **流量**（关掉 Wi-Fi）打开公网 URL | 能看到信封 |

公网打不通、局域网通：几乎都是 **没做端口转发 / 安全组没放行 / CGNAT**。

---

## 常见问题

**1. 502 Bad Gateway**  
Nginx 起来了，后端没起来。先 `curl 127.0.0.1:18099`。看 `/var/log/nginx/error.log`。

**2. 页面能开，但没样式 / 脚本报 404**  
路径前缀方案里 `proxy_pass` 漏了末尾 `/`，或用了 `/mia` 而没有跳到 `/mia/`。本页资源都是相对路径 `css/style.css`、`js/app.js`，必须保证浏览器地址栏以 `/mia/` 结尾。

**3. 只有 IP、没有域名，能上 HTTPS 吗？**  
Let’s Encrypt **不给纯 IP 签证书**。要用 HTTPS 需要域名（你已有 `hsbwxy.com`，可加子域如 `mia.hsbwxy.com` 再 `certbot`）。纯 IP 就用 HTTP。

**4. 微信里打不开**  
用系统浏览器，或绑定域名 + HTTPS。不要依赖微信直接打开 `http://IP:端口`。

**5. 字体加载失败、排版变系统字体**  
页面引用了 Google Fonts，国内手机可能被墙。这和 Nginx 无关；不影响信封、蛋糕主流程。

**6. 改完 HTML 手机还是旧页面**  
强刷或加 `?v=2`。`index.html` 不要长期缓存。

**7. 80 上已有 default_server，会不会抢流量？**  
方案一听 8099，方案二只匹配 `/mia/`，都不会抢走 `http://公网IP/` 的 plantAnwser。

---

## 附录：用 systemd 让静态服务开机自启

```bash
sudo tee /etc/systemd/system/happybirthday-h5.service >/dev/null <<'EOF'
[Unit]
Description=Happy birthday static H5
After=network.target

[Service]
Type=simple
User=wong
WorkingDirectory=/home/wong/MachineLearing/happybirthday
ExecStart=/usr/bin/python3 -m http.server 18099 --bind 127.0.0.1
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now happybirthday-h5
sudo systemctl status happybirthday-h5
```

若本机 `python3` 实际在 conda 里，把 `ExecStart` 改成 `which python3` 看到的绝对路径。
