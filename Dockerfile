FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Render จะกำหนด PORT เองตอนรัน
ENV PORT=5000
EXPOSE 5000

# ใช้ shell command เพื่ออ่าน env PORT ของ Render ได้จริง
CMD ["sh", "-c", "node index.js"]
