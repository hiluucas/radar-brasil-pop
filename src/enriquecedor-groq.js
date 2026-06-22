import { pool } from "./db.js";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

if (!GROQ_API_KEY) {
    console.error("❌ GROQ_API_KEY não configurada.");
    process.exit(1);
}

const mapaEstados = {
    acre: "AC", alagoas: "AL", amapá: "AP", amapa: "AP", amazonas: "AM",
    bahia: "BA", ceará: "CE", ceara: "CE", "distrito federal": "DF",
    "espírito santo": "ES", "espirito santo": "ES", goiás: "GO", goias: "GO",
    maranhão: "MA", maranhao: "MA", "mato grosso": "MT",
    "mato grosso do sul": "MS", "minas gerais": "MG", pará: "PA", para: "PA",
    paraíba: "PB", paraiba: "PB", paraná: "PR", parana: "PR",
    pernambuco: "PE", piauí: "PI", piaui: "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", rondônia: "RO",
    rondonia: "RO", roraima: "RR", "santa catarina": "SC", "são paulo": "SP",
    "sao paulo": "SP", sergipe: "SE", tocantins: "TO"
};

const regioesPorEstado = {
    AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
    AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
    DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
    ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
    PR: "Sul", RS: "Sul", SC: "Sul"
};

function limparValor(valor) {
    if (valor === undefined || valor === null) return null;
    const texto = String(valor).trim();
    if (!texto) return null;
    if (["null", "undefined", "não informado", "nao informado", "a definir"].includes(texto.toLowerCase())) return null;
    return texto;
}

function normalizarEstado(valor) {
    const texto = limparValor(valor);
    if (!texto) return null;

    const upper = texto.toUpperCase();
    if (/^[A-Z]{2}$/.test(upper)) return upper;

    const key = texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    return mapaEstados[key] || null;
}

function normalizarRegiao(valor, estado) {
    if (estado && regioesPorEstado[estado]) return regioesPorEstado[estado];

    const texto = limparValor(valor);
    if (!texto) return null;

    const key = texto.toLowerCase();

    if (key.includes("norte") || key.includes("amaz")) return "Norte";
    if (key.includes("nordeste")) return "Nordeste";
    if (key.includes("centro")) return "Centro-Oeste";
    if (key.includes("sudeste")) return "Sudeste";
    if (key.includes("sul")) return "Sul";

    return null;
}

function normalizarData(valor) {
    const texto = limparValor(valor);
    if (!texto) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

    const matchBR = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (matchBR) {
        const [, dia, mes, ano] = matchBR;
        return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
    }

    const meses = {
        janeiro: "01",
        fevereiro: "02",
        marco: "03",
        março: "03",
        abril: "04",
        maio: "05",
        junho: "06",
        julho: "07",
        agosto: "08",
        setembro: "09",
        outubro: "10",
        novembro: "11",
        dezembro: "12"
    };

    const normalizado = texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const matchExtenso = normalizado.match(/^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})$/);

    if (matchExtenso) {
        const [, dia, mesNome, ano] = matchExtenso;
        const mes = meses[mesNome];

        if (mes) {
            return `${ano}-${mes}-${dia.padStart(2, "0")}`;
        }
    }

    return null;
}

function limitarTexto(valor, limite) {
    const texto = limparValor(valor);
    if (!texto) return null;
    return texto.slice(0, limite);
}

function normalizarDados(dados) {
    const estado = normalizarEstado(dados.estado);
    const regiao = normalizarRegiao(dados.regiao, estado);

    return {
        nome_limpo: limitarTexto(dados.nome_limpo, 250),
        data_inicio: normalizarData(dados.data_inicio),
        data_fim: normalizarData(dados.data_fim),
        cidade: limitarTexto(dados.cidade, 120),
        estado,
        regiao,
        local: limitarTexto(dados.local, 200),
        genero: limitarTexto(dados.genero, 120),
        resumo_ana: limitarTexto(dados.resumo_ana, 240)
    };
}

async function chamarGroq(evento) {
    const prompt = `
Extraia informações estruturadas do evento abaixo.

Retorne APENAS JSON válido, sem markdown.

Formato:
{
  "nome_limpo": "",
  "data_inicio": "YYYY-MM-DD ou null",
  "data_fim": "YYYY-MM-DD ou null",
  "cidade": null,
  "estado": "UF ou null",
  "regiao": null,
  "local": null,
  "genero": null,
  "resumo_ana": ""
}

Regras:
- Não invente informação.
- Estado deve ser SEMPRE sigla de 2 letras: SP, RJ, GO, PA, etc.
- Nunca retorne nome completo do estado.
- Se não souber, use null.
- Datas em YYYY-MM-DD.
- Região: Norte, Nordeste, Centro-Oeste, Sudeste ou Sul.
- resumo_ana com no máximo 240 caracteres.

Evento:
${evento.nome_evento}
`.trim();

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: "Você é um parser de eventos musicais brasileiros. Responda somente JSON válido."
                },
                {
                    role: "user",
                    content: prompt
                }
            ]
        })
    });

    if (!response.ok) {
        const erro = await response.text();
        throw new Error(`Groq ${response.status}: ${erro}`);
    }

    const json = await response.json();
    const texto = json?.choices?.[0]?.message?.content;

    if (!texto) throw new Error("Groq retornou resposta vazia.");

    const limpo = texto.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(limpo);
}

async function obterLocalId(dados) {
    if (!dados.local && !dados.cidade) return null;

    const resultado = await pool.query(
        `
    INSERT INTO locais (nome, cidade, estado, regiao)
    VALUES ($1, $2, $3, $4)
    RETURNING id
    `,
        [dados.local, dados.cidade, dados.estado, dados.regiao]
    );

    return resultado.rows[0].id;
}

async function atualizarEvento(evento, dados) {
    const localId = await obterLocalId(dados);

    await pool.query(
        `
    UPDATE eventos
    SET
      nome_evento = COALESCE($1, nome_evento),
      data_inicio = $2,
      data_fim = $3,
      genero = $4,
      resumo_ana = $5,
      local_id = COALESCE($6, local_id),
      status = 'enriquecido',
      atualizado_em = NOW()
    WHERE id = $7
    `,
        [
            dados.nome_limpo,
            dados.data_inicio,
            dados.data_fim,
            dados.genero,
            dados.resumo_ana,
            localId,
            evento.id
        ]
    );
}

async function run() {
    console.log("==================================");
    console.log("RADAR BRASIL-POP - ENRIQUECEDOR GROQ");
    console.log("==================================");

    const eventos = await pool.query(`
    SELECT id, nome_evento
    FROM eventos
    WHERE status IN ('pendente', 'normalizado')
    ORDER BY id
    LIMIT 10
  `);

    console.log(`Eventos encontrados: ${eventos.rows.length}`);

    let sucesso = 0;

    for (const evento of eventos.rows) {
        console.log("--------------------------------");
        console.log(`Evento ${evento.id}: ${evento.nome_evento}`);

        try {
            const resposta = await chamarGroq(evento);
            const dados = normalizarDados(resposta);

            console.log("Dados normalizados:");
            console.log(dados);

            await atualizarEvento(evento, dados);

            console.log("✅ Evento enriquecido.");
            sucesso++;
        } catch (erro) {
            console.error("❌ Erro ao enriquecer evento:");
            console.error(erro.message);
        }
    }

    console.log("==================================");
    console.log(`Finalizado. Eventos enriquecidos: ${sucesso}`);
    console.log("==================================");

    process.exit(0);
}

run();