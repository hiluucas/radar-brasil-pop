# Radar Brasil-Pop API 📡🇧🇷

A primeira versão da API do projeto **Radar Brasil-Pop**. Esta API foi desenvolvida em **Node.js** utilizando **Express** e se conecta a um banco de dados **PostgreSQL**.

## 🛠️ Tecnologias Utilizadas

- **Node.js** (v22-alpine no Docker)
- **Express** - Framework web para Node.js
- **pg (node-postgres)** - Cliente PostgreSQL para Node.js
- **Docker & Docker Compose** - Containerização da aplicação

## 🚀 Como Executar o Projeto

### Pré-requisitos
- Node.js instalado localmente (opcional se usar Docker)
- Docker instalado na máquina

### Usando Docker
Para rodar a aplicação em um container Docker:

1. Construa a imagem Docker:
   ```bash
   docker build -t radar-brasil-pop-api .
   ```

2. Execute o container:
   ```bash
   docker run -p 3000:3000 radar-brasil-pop-api
   ```

### Executando Localmente
1. Instale as dependências:
   ```bash
   npm install
   ```

2. Inicie o servidor:
   ```bash
   npm start
   ```

---
Desenvolvido para monitoramento e análise de tendências de música pop no Brasil.
