FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ✅ ให้ Render ควบคุม port เอง
EXPOSE $PORT

CMD ["node", "index.js"]
