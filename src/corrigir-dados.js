import { pool } from "./db.js";

const correcoes = [
    { id: 119, data_inicio: "2026-06-03", data_fim: "2026-07-19" },
    { id: 118, data_inicio: "2026-06-03", data_fim: "2026-06-07" },
    { id: 120, data_inicio: "2026-06-03", data_fim: "2026-07-05" },
    { id: 121, data_inicio: "2026-06-03", data_fim: "2026-06-04" },
    { id: 123, data_inicio: "2026-07-04", data_fim: null, estado: "SC", regiao: "Sul" }
];

async function run() {
    console.log("Iniciando correção de dados...");

    for (const item of correcoes) {
        await pool.query(
            `
      UPDATE eventos
      SET data_inicio = $1,
          data_fim = $2,
          atualizado_em = NOW()
      WHERE id = $3
      `,
            [item.data_inicio, item.data_fim, item.id]
        );

        if (item.estado || item.regiao) {
            await pool.query(
                `
        UPDATE locais
        SET estado = COALESCE($1, estado),
            regiao = COALESCE($2, regiao),
            atualizado_em = NOW()
        WHERE id = (
          SELECT local_id FROM eventos WHERE id = $3
        )
        `,
                [item.estado || null, item.regiao || null, item.id]
            );
        }

        console.log(`Evento corrigido: ${item.id}`);
    }

    console.log("Correções finalizadas.");
    process.exit(0);
}

run().catch((error) => {
    console.error("Erro ao corrigir dados:", error);
    process.exit(1);
});