import { pool } from "./db.js";

const estadosPorCidade = {
    "São Paulo": "SP",
    "Rio de Janeiro": "RJ",
    "Belo Horizonte": "MG",
    "Recife": "PE",
    "Salvador": "BA",
    "Brasília": "DF",
    "Florianópolis": "SC",
    "Belém": "PA",
    "Natal": "RN",
    "Maceió": "AL",
    "Curitiba": "PR",
    "Manaus": "AM",
    "Campina Grande": "PB",
    "Porto Velho": "RO",
    "Vitória": "ES",
    "Vitória da Conquista": "BA",
    "Jaguariúna": "SP",
    "Ribeirão Preto": "SP",
    "Petrópolis": "RJ",
    "Pirassununga": "SP",
    "Jacareí": "SP",
    "São José": "SC",
    "Goiânia": "GO"
};

const regioes = {
    SP: "Sudeste", RJ: "Sudeste", MG: "Sudeste", ES: "Sudeste",
    PR: "Sul", SC: "Sul", RS: "Sul",
    BA: "Nordeste", PE: "Nordeste", CE: "Nordeste", RN: "Nordeste",
    PB: "Nordeste", AL: "Nordeste", SE: "Nordeste", MA: "Nordeste", PI: "Nordeste",
    PA: "Norte", AM: "Norte", AP: "Norte", RR: "Norte", RO: "Norte", AC: "Norte", TO: "Norte",
    DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste"
};

function detectarCidade(texto) {
    return Object.keys(estadosPorCidade).find(cidade => texto.includes(cidade)) || null;
}

async function run() {
    const eventos = await pool.query(`
    SELECT id, nome_evento
    FROM eventos
    WHERE status = 'pendente'
  `);

    let atualizados = 0;

    for (const evento of eventos.rows) {
        const cidade = detectarCidade(evento.nome_evento);
        if (!cidade) continue;

        const estado = estadosPorCidade[cidade];
        const regiao = regioes[estado] || null;

        const localNome = evento.nome_evento.includes(" - ")
            ? evento.nome_evento.split(" - ").slice(-2, -1)[0]?.trim()
            : null;

        const localResult = await pool.query(
            `
      INSERT INTO locais (nome, cidade, estado, regiao)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
            [localNome, cidade, estado, regiao]
        );

        const localId = localResult.rows[0].id;

        await pool.query(
            `
      UPDATE eventos
      SET local_id = $1,
          status = 'normalizado',
          atualizado_em = NOW()
      WHERE id = $2
      `,
            [localId, evento.id]
        );

        atualizados++;
    }

    console.log(`Eventos normalizados: ${atualizados}`);
    process.exit(0);
}

run().catch(error => {
    console.error("Erro ao enriquecer eventos:", error);
    process.exit(1);
});