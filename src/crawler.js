import * as cheerio from "cheerio";
import { pool } from "./db.js";

const SOURCE_NAME = "Mapa dos Festivais";
const SOURCE_URL = "https://mapadosfestivais.com.br/calendario-festivais/";

function normalizeText(value = "") {
    return value
        .toString()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function createHash({ nomeEvento, cidade, dataInicio }) {
    return [
        normalizeText(nomeEvento),
        normalizeText(cidade || "nao-informado"),
        dataInicio || "sem-data"
    ].join("|");
}

async function getFonteId() {
    const result = await pool.query(
        "SELECT id FROM fontes WHERE nome = $1 LIMIT 1",
        [SOURCE_NAME]
    );

    if (result.rows.length === 0) {
        throw new Error(`Fonte não encontrada: ${SOURCE_NAME}`);
    }

    return result.rows[0].id;
}

async function saveEvento(evento) {
    const sql = `
    INSERT INTO eventos (
      fonte_id,
      nome_evento,
      descricao,
      tipo_evento,
      url,
      status,
      hash_duplicado
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (hash_duplicado)
    DO UPDATE SET
      descricao = EXCLUDED.descricao,
      url = EXCLUDED.url,
      atualizado_em = NOW()
    RETURNING id;
  `;

    const values = [
        evento.fonteId,
        evento.nomeEvento,
        evento.descricao,
        evento.tipoEvento,
        evento.url,
        evento.status,
        evento.hashDuplicado
    ];

    return pool.query(sql, values);
}

async function runCrawler() {
    console.log("Iniciando crawler do Mapa dos Festivais...");

    const fonteId = await getFonteId();

    const response = await fetch(SOURCE_URL, {
        headers: {
            "User-Agent": "Mozilla/5.0 RadarBrasilPop/1.0"
        }
    });

    if (!response.ok) {
        throw new Error(`Erro ao acessar fonte: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const possibleCards = $("article, .elementor-widget-container, .jet-listing-grid__item, .card, div").toArray();

    let totalProcessado = 0;

    for (const card of possibleCards) {
        const el = $(card);
        const text = el.text().replace(/\s+/g, " ").trim();

        if (text.length < 30) continue;
        if (!/festival|festivais|show|música|musica/i.test(text)) continue;

        const title =
            el.find("h1,h2,h3,h4,a").first().text().replace(/\s+/g, " ").trim();

        if (!title || title.length < 3 || title.length > 160) continue;

        const link = el.find("a").attr("href") || SOURCE_URL;

        const evento = {
            fonteId,
            nomeEvento: title,
            descricao: text.slice(0, 1200),
            tipoEvento: "festival",
            url: link,
            status: "pendente"
        };

        evento.hashDuplicado = createHash({
            nomeEvento: evento.nomeEvento,
            cidade: "nao-informado",
            dataInicio: "sem-data"
        });

        await saveEvento(evento);
        totalProcessado++;
    }

    await pool.query(
        `
    INSERT INTO crawler_execucoes (
      fonte_id,
      status,
      eventos_encontrados,
      eventos_novos,
      mensagem,
      finalizado_em
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    `,
        [
            fonteId,
            "finalizado",
            totalProcessado,
            totalProcessado,
            "Crawler executado com sucesso"
        ]
    );

    console.log(`Crawler finalizado. Eventos processados: ${totalProcessado}`);
}

runCrawler()
    .then(() => {
        console.log("Execução concluída.");
        process.exit(0);
    })
    .catch((error) => {
        console.error("Erro no crawler:", error);
        process.exit(1);
    });