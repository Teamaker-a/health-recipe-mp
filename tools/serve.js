#!/usr/bin/env node
/**
 * serve.js - 本地静态服务器（用于预览 H5 版）
 * 零依赖：仅用 Node 内置 http / fs。
 *
 * 运行：node tools/serve.js [port]     默认 8080
 * 访问：http://localhost:8080
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const DIST = path.resolve(__dirname, '..', 'web', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let filePath = path.join(DIST, urlPath);

  // 防目录穿越
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA 回退
      filePath = path.join(DIST, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    fs.readFile(filePath, (e, buf) => {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  });
});

server.listen(PORT, () => {
  console.log(`\n🍃 轻食谱 H5 预览已启动`);
  console.log(`   → http://localhost:${PORT}\n`);
  console.log('   手机访问：把 localhost 换成本机局域网 IP 即可。');
  console.log('   停止：Ctrl+C\n');
});
