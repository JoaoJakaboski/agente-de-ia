const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";

async function enviarMensagemWhatsapp(instancia, telefoneCliente, texto) {
    try {
        const resposta = await fetch (`${EVOLUTION_API_URL}/message/sendText/${instancia}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
                number: telefoneCliente,
                text: texto
            }),
        });

        if (!resposta.ok) {
            console.error("Falha ao enviar mensagem:", resposta.status, await resposta.text());
        }

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error.message);
    }
}

module.exports = { enviarMensagemWhatsapp };