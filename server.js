// 1. Importando os pacotes necessários
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

// 2. Inicializando o aplicativo Express
const app = express();

// 3. Configurando os middlewares
app.use(cors()); // Permite requisições do front-end
app.use(express.json()); // Permite que a API entenda dados enviados no formato JSON

// 4. Configurando a conexão com o banco delivery_db
const db = mysql.createConnection({
    host: 'deliverydatabase-delivery.i.aivencloud.com', // Cole o seu Host do Aiven
    port: 13500, // Cole a Porta do Aiven
    user: 'avnadmin',
    password: 'AVNS_Exs_icgILIloS-qBCZu', // Cole a senha do Aiven
    database: 'delivery_db',
    ssl: {
        rejectUnauthorized: false // O Aiven exige conexão segura (SSL)
    }
});

// 5. Testando a conexão
db.connect((err) => {
    if (err) {
        console.error('Erro de conexão com o banco de dados:', err.message);
        return;
    }
    console.log('Conexão estabelecida com o delivery_db com sucesso!');
});

// ROTA 1: Buscar restaurantes ativos
app.get('/api/restaurantes', (req, res) => {
    const query = "SELECT id, nome, regiao, categoria FROM restaurantes WHERE status = 'Ativo'";
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Erro na consulta:', err);
            // Retorna status 500 (Erro Interno do Servidor) se algo der errado
            return res.status(500).json({ erro: 'Falha ao buscar restaurantes' });
        }
        // Retorna os resultados em formato JSON
        res.json(results);
    });
});

// ROTA 2: Buscar entregadores disponíveis
app.get('/api/entregadores', (req, res) => {
    const query = 'SELECT nome, veiculo_tipo, veiculo_placa FROM entregadores WHERE status = "Disponivel"';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Erro na consulta:', err);
            return res.status(500).json({ erro: 'Falha ao buscar entregadores' });
        }
        res.json(results);
    });
});

// 6. Iniciando o servidor
// Se o provedor de nuvem der uma porta, use-a. Se não, use a 3000 localmente.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor da API rodando na porta ${PORT}`);
});

// ROTA 3: Criar um novo pedido usando a Procedure sp_cadastrarPedido
app.post('/api/pedidos', (req, res) => {
    // Extraindo os dados que o Front-end vai enviar no "corpo" (body) da requisição
    const { 
        cliente_id, 
        restaurante_id, 
        entregador_id, 
        produto_id, 
        quantidade, 
        taxa_entrega, 
        taxa_servico 
    } = req.body;

    // Chamando a sua Procedure
    const query = 'CALL sp_cadastrarPedido(?, ?, ?, ?, ?, ?, ?)';
    const valores = [cliente_id, restaurante_id, entregador_id, produto_id, quantidade, taxa_entrega, taxa_servico];

    db.query(query, valores, (err, results) => {
        if (err) {
            console.error('Erro ao processar pedido:', err);
            // Se o estoque for insuficiente (regra que você criou na procedure), o erro volta aqui
            return res.status(400).json({ erro: err.message });
        }
        res.json({ mensagem: 'Pedido realizado com sucesso!', detalhes: results });
    });
});

// ROTA 4: Buscar os produtos de um restaurante específico
app.get('/api/restaurantes/:id/produtos', (req, res) => {
    // O :id na URL é um parâmetro dinâmico. Pegamos ele aqui:
    const restauranteId = req.params.id; 
    
    // Buscamos apenas produtos ativos, com estoque e que pertencem ao restaurante clicado
    const query = `
        SELECT id, nome, preco, categoria, estoque 
        FROM produtos 
        WHERE restaurante_id = ? AND status = 'Ativo' AND estoque > 0
    `;
    
    db.query(query, [restauranteId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar produtos:', err);
            return res.status(500).json({ erro: 'Falha ao buscar o cardápio' });
        }
        res.json(results);
    });
});

// ROTA 5: Buscar histórico de pedidos do cliente (Acompanhamento de Status)
app.get('/api/clientes/:id/pedidos', (req, res) => {
    const clienteId = req.params.id;
    
    // O JOIN une a tabela pedidos com restaurantes para pegarmos o nome do local
    const query = `
        SELECT p.id, r.nome AS restaurante, p.valor_total, p.status, p.data_pedido 
        FROM pedidos p
        JOIN restaurantes r ON p.restaurante_id = r.id
        WHERE p.cliente_id = ?
        ORDER BY p.data_pedido DESC
    `;
    
    db.query(query, [clienteId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar pedidos:', err);
            return res.status(500).json({ erro: 'Falha ao carregar histórico' });
        }
        res.json(results);
    });
});

// ROTA 6: Autenticação de Usuário (Login)
app.post('/api/login', (req, res) => {
    const { email, senha } = req.body;

    // Utilizamos a sua função fn_encriptarSenha do MySQL para validar a criptografia
    const query = `
        SELECT id, nome, email 
        FROM clientes 
        WHERE email = ? AND senha = fn_encriptarSenha(?)
    `;

    db.query(query, [email, senha], (err, results) => {
        if (err) {
            console.error('Erro ao processar login:', err);
            return res.status(500).json({ erro: 'Erro interno no servidor' });
        }

        if (results.length === 0) {
            // Código 401 significa "Não Autorizado"
            return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
        }

        // Se encontrou o usuário, devolve os dados (sem a senha, por segurança)
        res.json({ 
            mensagem: 'Login realizado com sucesso', 
            cliente: results[0] 
        });
    });
});

// ROTA 5: Buscar pedidos do cliente para acompanhamento em tempo real
app.get('/api/clientes/:id/pedidos', (req, res) => {
    const clienteId = req.params.id;
    
    const query = `
        SELECT p.id, r.nome AS restaurante, p.valor_total, p.status, p.data_pedido 
        FROM pedidos p
        JOIN restaurantes r ON p.restaurante_id = r.id
        WHERE p.cliente_id = ?
        ORDER BY p.data_pedido DESC
    `;
    
    db.query(query, [clienteId], (err, results) => {
        if (err) {
            return res.status(500).json({ erro: 'Falha ao buscar pedidos' });
        }
        res.json(results);
    });
});

// ROTA 7: Painel Admin - Listar pedidos ativos (Fila de Trabalho)
app.get('/api/admin/pedidos', (req, res) => {
    // Trazemos o nome do cliente e do restaurante com JOIN. 
    // Ignoramos o que já foi "Entregue" ou "Cancelado" para limpar a tela.
    const query = `
        SELECT p.id, c.nome AS cliente, r.nome AS restaurante, p.valor_total, p.status, p.data_pedido 
        FROM pedidos p
        JOIN clientes c ON p.cliente_id = c.id
        JOIN restaurantes r ON p.restaurante_id = r.id
        WHERE p.status NOT IN ('Entregue', 'Cancelado')
        ORDER BY p.data_pedido ASC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Erro no Admin:', err);
            return res.status(500).json({ erro: 'Falha ao buscar fila de pedidos' });
        }
        res.json(results);
    });
});

// ROTA 8: Painel Admin - Atualizar o status do pedido
app.put('/api/admin/pedidos/:id/status', (req, res) => {
    const pedidoId = req.params.id;
    const { novoStatus } = req.body; // Recebemos o novo status do Front-end
    
    const query = 'UPDATE pedidos SET status = ? WHERE id = ?';
    
    db.query(query, [novoStatus, pedidoId], (err, results) => {
        if (err) {
            console.error('Erro ao atualizar status:', err);
            return res.status(500).json({ erro: 'Falha ao atualizar o banco' });
        }
        res.json({ mensagem: 'Status atualizado com sucesso!' });
    });
});