# syntax=docker/dockerfile:1

# ---- 构建阶段：TypeScript 类型检查 + Vite 产出静态文件 ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 运行阶段：nginx 托管静态页面 ----
FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# ---- 验收阶段：Vitest 单元测试 + Playwright 真实浏览器端到端测试 ----
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS verify
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "verify"]
