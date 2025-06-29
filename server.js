// server.js
const express = require('express');
const http = require('http'); // Módulo http nativo do Node.js
const { Server } = require('socket.io'); // Importa o Server do socket.io
const productsRouter = require('./routes/products'); // Nossas rotas de produtos
const path = require('path'); // Módulo path para lidar com caminhos de arquivos

const app = express();
const server = http.createServer(app); // Crie um servidor HTTP a partir da sua aplicação Express
const io = new Server(server, {
  cors: {
    origin: '*', // Permitir conexão de qualquer origem para o WebSocket
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(express.json()); // Para fazer parse de JSON no corpo das requisições
app.use(express.urlencoded({ extended: true })); // Para fazer parse de URL-encoded bodies

// Servir arquivos estáticos da pasta 'uploads' (para acessar as imagens)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware para injetar o objeto io (socket.io) nas requisições
app.use((req, res, next) => {
  req.io = io;
  next();
});

const cors = require('cors');
app.use(cors());
// --- Rotas da API ---
app.use('/products', productsRouter);

// --- Rota de Teste Simples ---
app.get('/', (req, res) => {
  res.send('API de Catálogo de Produtos funcionando!');
});

// --- Conexão WebSocket ---
io.on('connection', (socket) => {
  console.log(`Cliente conectado via WebSocket: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado via WebSocket: ${socket.id}`);
  });

  // Você pode adicionar mais eventos aqui, se precisar que o cliente envie algo
  // Ex: socket.on('getProducts', () => { socket.emit('productsUpdate', products); });
});

// --- Iniciar o Servidor ---
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Servidor WebSocket rodando na porta ${PORT}`);
});