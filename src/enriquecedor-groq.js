import { pool } from "./db.js";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

if (!GROQ_API_KEY) {
    console.error("❌ GROQ_API_KEY não configurada.");
    process.exit(1);
}

async function chamarGroq(evento) {
    const prompt = `
Extraia informações estruturadas do evento abaixo.

Retorne APENAS JSON válido.

Formato:

{
  "nome_limpo":"",
  "data_inicio":null,
  "data_fim":null,
  "cidade":null,
  "estado":null,
  "regiao":null,
  "local":null,
  "genero":null,
  "resumo_ana":""
}

Evento:

${evento.nome_evento}
`;

    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                temperature: 0.1,
                messages: [
                    {
                        role: "system",
                        content:
                            "Você é um especialista em festivais brasileiros. Responda apenas JSON válido.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            }),
        }
    );

    if (!response.ok) {
        const erro = await response.text();
        throw new Error(`Groq ${response.status}: ${erro}`);
    }

    const json = await response.json();

    const texto = json?.choices?.[0]?.message?.content;

    if (!texto) {
        throw new Error("Groq retornou resposta vazia.");
    }

    console.log("\n==============================");
    console.log("Resposta da IA:");
    console.log(texto);
    console.log("==============================\n");

    try {
        return JSON.parse(texto);
    } catch {
        const limpo = texto
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        return JSON.parse(limpo);
    }
}

async function obterLocalId(dados) {
    if (!dados.local && !dados.cidade) {
        return null;
    }

    const resultado = await pool.query(
        `
INSERT INTO locais
(nome,cidade,estado,regiao)
VALUES ($1,$2,$3,$4)
RETURNING id
`,
        [
            dados.local,
            dados.cidade,
            dados.estado,
            dados.regiao,
        ]
    );

    return resultado.rows[0].id;
}

async function atualizarEvento(evento, dados) {
    const localId = await obterLocalId(dados);

    await pool.query(
        `
UPDATE eventos
SET
nome_evento=$1,
data_inicio=$2,
data_fim=$3,
genero=$4,
resumo_ana=$5,
local_id=COALESCE($6,local_id),
status='enriquecido',
atualizado_em=NOW()
WHERE id=$7
`,
        [
            dados.nome_limpo || evento.nome_evento,
            dados.data_inicio,
            dados.data_fim,
            dados.genero,
            dados.resumo_ana,
            localId,
            evento.id,
        ]
    );
}

async function run() {

    console.log("==================================");
    console.log("RADAR BRASIL POP - ENRIQUECEDOR");
    console.log("==================================");

    const eventos = await pool.query(`
SELECT
id,
nome_evento
FROM eventos
WHERE status IN ('pendente','normalizado')
ORDER BY id
LIMIT 10
`);

    console.log(`Eventos encontrados: ${eventos.rows.length}`);

    let sucesso = 0;

    for (const evento of eventos.rows) {

        console.log("\n--------------------------------");
        console.log(`Evento ${evento.id}`);
        console.log(evento.nome_evento);

        try {

            const dados = await chamarGroq(evento);

            console.log("JSON convertido:");
            console.log(dados);

            await atualizarEvento(evento, dados);

            console.log("✅ Evento atualizado.");

            sucesso++;

        } catch (erro) {

            console.error("\n❌ ERRO");
            console.error(erro);

        }

    }

    console.log("\n==================================");
    console.log(`Finalizado.`);
    console.log(`Eventos enriquecidos: ${sucesso}`);
    console.log("==================================");

    process.exit(0);

}

run();