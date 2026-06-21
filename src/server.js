import express from "express";
import { pool } from "./db.js";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        service: "Radar Brasil-Pop",
        version: "1.0.0"
    });
});

app.get("/eventos", async (req, res) => {
    const { cidade, estado, status = "pendente" } = req.query;

    const values = [];
    const where = [];

    if (cidade) {
        values.push(cidade);
        where.push(`l.cidade ILIKE $${values.length}`);
    }

    if (estado) {
        values.push(estado.toUpperCase());
        where.push(`l.estado = $${values.length}`);
    }

    if (status) {
        values.push(status);
        where.push(`e.status = $${values.length}`);
    }

    const sql = `
    SELECT
      e.id,
      e.nome_evento,
      e.data_inicio,
      e.data_fim,
      e.genero,
      e.tipo_evento,
      e.url,
      e.resumo_ana,
      e.status,
      f.nome AS fonte,
      l.nome AS local,
      l.cidade,
      l.estado,
      l.regiao
    FROM eventos e
    LEFT JOIN fontes f ON f.id = e.fonte_id
    LEFT JOIN locais l ON l.id = e.local_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY e.data_inicio ASC NULLS LAST
    LIMIT 50;
  `;

    const result = await pool.query(sql, values);
    res.json({ eventos: result.rows });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Radar Brasil-Pop rodando na porta ${port}`);
});