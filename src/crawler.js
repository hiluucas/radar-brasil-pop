import * as cheerio from "cheerio";
import { pool } from "./db.js";

const SOURCE_NAME = "Mapa dos Festivais";
const SOURCE_URL = "https://mapadosfestivais.com.br/calendario-festivais/";

function normalizeText(value = "") {
    return value.toString().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function createHash({ nomeEvento, url }) {
    return [normalizeText(nomeEvento), url || "sem-url"].join("|");
}

async function getFonteId() {
    const result = await pool.query("SELECT id FROM fontes WHERE nome = $1 LIMIT 1", [SOURCE_NAME]);
    if (!result.rows.length) throw new Error(`Fonte não encontrada: ${SOURCE_NAME}`);
    return result.rows[0].id;
}

async function saveEvento(evento) {
    return pool.query(
        `
    INSERT INTO eventos (
      fonte_id, nome_evento, descricao, tipo_evento, url, status, hash_duplicado
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (hash_duplicado)
    DO UPDATE SET
      descricao = EXCLUDED.descricao,
      url = EXCLUDED.url,
      atualizado_em = NOW()
    RETURNING id;
    `,
        [
            evento.fonteId,
            evento.nomeEvento,
            evento.descricao,
            evento.tipoEvento,
            evento.url,
            evento.status,
            evento.hashDuplicado
        ]
    );
}

async function runCrawler() {
    console.log("Iniciando crawler refinado do Mapa dos Festivais...");

    const fonteId = await getFonteId();

    const response = await fetch(SOURCE_URL, {
        headers: { "User-Agent": "Mozilla/5.0 RadarBrasilPop/1.0" }
    });

    if (!response.ok) throw new Error(`Erro ao acessar fonte: ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);

    const links = new Map();

    $("a[href]").each((_, item) => {
        const href = $(item).attr("href");
        const text = $(item).text().replace(/\s+/g, " ").trim();

        if (!href) return;
        if (!href.includes("/eventos/")) return;
        if (!text || text.length < 4) return;
        if (text.length > 180) return;

        links.set(href, text);
    });

    let totalProcessado = 0;

    for (const [url, nomeEvento] of links.entries()) {
        const evento = {
            fonteId,
            nomeEvento,
            descricao: nomeEvento,
            tipoEvento: "festival",
            url,
            status: "pendente"
        };

        evento.hashDuplicado = createHash({
            nomeEvento: evento.nomeEvento,
            url: evento.url
        });

        await saveEvento(evento);
        totalProcessado++;
    }

    await pool.query(
        `
    INSERT INTO crawler_execucoes (
      fonte_id, status, eventos_encontrados, eventos_novos, mensagem, finalizado_em
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    `,
        [fonteId, "finalizado", totalProcessado, totalProcessado, "Crawler refinado executado com sucesso"]
    );

    console.log(`Crawler refinado finalizado. Eventos processados: ${totalProcessado}`);
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