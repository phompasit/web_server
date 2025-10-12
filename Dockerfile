FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# ✅ บอกให้ Docker รู้ว่า Render จะส่ง PORT เข้ามา
ENV PORT=5000

# ✅ ให้ Docker รู้ว่าจะเปิดพอร์ต 5000 (Render จะ override PORT เองภายหลัง)
EXPOSE 5000

CMD ["node", "index.js"]
