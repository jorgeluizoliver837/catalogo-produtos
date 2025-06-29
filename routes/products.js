// routes/products.js
const express = require('express');
const multer = require('multer');
const { uuid } = require('uuidv4');
const path = require('path');
const fs = require('fs'); // Módulo para manipulação de arquivos (para deletar fotos)

const router = express.Router();

// --- Armazenamento em Memória ---
// Simula um "banco de dados" em memória
let products = [];

// --- Configuração do Multer (Upload de Imagens) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    // Garante que a pasta 'uploads' existe
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Gera um nome único para a imagem, mantendo a extensão original
    cb(null, uuid() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB por imagem
  fileFilter: (req, file, cb) => {
    // Valida os tipos de arquivo permitidos
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens (jpeg, jpg, png, gif) são permitidas!'));
    }
  }
});

// --- Funções Auxiliares para Emitir Eventos WebSocket ---
const emitProductsUpdate = (io) => {
  io.emit('productsUpdate', products); // Emite o catálogo completo para todos os clientes
  console.log('WebSocket: Catálogo atualizado emitido.');
};

// --- Rotas CRUD ---

// GET /products - Obter todos os produtos
router.get('/', (req, res) => {
  res.status(200).json(products);
});

// GET /products/:id - Obter um produto por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const product = products.find(p => p.id === id);

  if (!product) {
    return res.status(404).json({ message: 'Produto não encontrado.' });
  }
  res.status(200).json(product);
});

// POST /products - Criar um novo produto (com foto)
router.post('/', upload.single('foto'), (req, res) => {
  const { titulo, descricao, preco } = req.body;
  let fotoUrl = null;

  if (!titulo || !descricao || !preco) {
    // Se a validação falhar, tente remover o arquivo que Multer já salvou
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ message: 'Todos os campos (titulo, descricao, preco) são obrigatórios.' });
  }

  // Validação básica do preço
  if (isNaN(parseFloat(preco)) || parseFloat(preco) < 0) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ message: 'Preço deve ser um número positivo.' });
  }

  if (req.file) {
    // O caminho do arquivo salvo pelo Multer
    // O Multer já garante que o arquivo foi salvo no disco em 'uploads/'
    fotoUrl = `/uploads/${req.file.filename}`; // URL acessível publicamente
  } else {
    // Se a foto é opcional e não foi enviada
    // Se a foto for obrigatória, adicione um `return res.status(400).json({ message: 'Foto é obrigatória.' });`
  }

  const newProduct = {
    id: uuid(),
    titulo,
    descricao,
    preco: parseFloat(preco),
    fotoUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  products.push(newProduct);

  // Emitir atualização via WebSocket
  emitProductsUpdate(req.io);

  res.status(201).json({ message: 'Produto criado com sucesso!', product: newProduct });
});

// PUT /products/:id - Atualizar um produto existente (com ou sem nova foto)
router.put('/:id', upload.single('foto'), (req, res) => {
  const { id } = req.params;
  const { titulo, descricao, preco } = req.body;
  const productIndex = products.findIndex(p => p.id === id);

  if (productIndex === -1) {
    // Se o produto não for encontrado, e um arquivo foi enviado, exclua-o para não sobrar
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(404).json({ message: 'Produto não encontrado para atualização.' });
  }

  const existingProduct = products[productIndex];
  let oldFotoPath = null;

  // Validação básica do preço
  if (preco && (isNaN(parseFloat(preco)) || parseFloat(preco) < 0)) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ message: 'Preço deve ser um número positivo, se fornecido.' });
  }

  // Se uma nova foto foi enviada, salve-a e marque a antiga para exclusão
  if (req.file) {
    if (existingProduct.fotoUrl) {
      oldFotoPath = path.join(__dirname, '..', existingProduct.fotoUrl); // Caminho real do arquivo antigo
    }
    existingProduct.fotoUrl = `/uploads/${req.file.filename}`;
  }

  // Atualiza os outros campos se foram fornecidos
  existingProduct.titulo = titulo || existingProduct.titulo;
  existingProduct.descricao = descricao || existingProduct.descricao;
  existingProduct.preco = preco ? parseFloat(preco) : existingProduct.preco;
  existingProduct.updatedAt = new Date().toISOString();

  // Exclui a foto antiga se uma nova foi carregada e a antiga existia
  if (oldFotoPath && fs.existsSync(oldFotoPath)) {
    fs.unlink(oldFotoPath, (err) => {
      if (err) console.error('Erro ao deletar foto antiga:', err);
    });
  }

  // Emitir atualização via WebSocket
  emitProductsUpdate(req.io);

  res.status(200).json({ message: 'Produto atualizado com sucesso!', product: existingProduct });
});

// DELETE /products/:id - Deletar um produto
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const productIndex = products.findIndex(p => p.id === id);

  if (productIndex === -1) {
    return res.status(404).json({ message: 'Produto não encontrado para exclusão.' });
  }

  const deletedProduct = products.splice(productIndex, 1)[0];

  // Se o produto tinha uma foto, exclua o arquivo físico
  if (deletedProduct.fotoUrl) {
    const fotoPath = path.join(__dirname, '..', deletedProduct.fotoUrl);
    if (fs.existsSync(fotoPath)) {
      fs.unlink(fotoPath, (err) => {
        if (err) console.error('Erro ao deletar foto:', err);
      });
    }
  }

  // Emitir atualização via WebSocket
  emitProductsUpdate(req.io);

  res.status(200).json({ message: 'Produto deletado com sucesso!', product: deletedProduct });
});

module.exports = router;